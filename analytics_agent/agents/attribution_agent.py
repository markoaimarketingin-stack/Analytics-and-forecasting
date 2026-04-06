from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd

from analytics_agent.db import queries
from analytics_agent.state import AnalyticsState, AttributionAnalysis


@dataclass
class AttributionRequest:
    budget_shift_cap_percent: int = 20
    attribution_model: str = "linear"
    metric: str = "revenue"


class AttributionAgent:
    """Determines channel-level revenue credit and budget reallocation guidance."""

    def analyze(
        self,
        state: AnalyticsState,
        request: AttributionRequest | None = None,
    ) -> AnalyticsState:
        request = self._build_request(state, request)

        events_df, tx_df, campaign_df, source_info = self._load_dataframes(state)

        if events_df.empty or tx_df.empty:
            state.attribution_analysis = AttributionAnalysis(
                best_channel="",
                worst_channel="",
                channel_weights={},
                recommended_shift={},
                channel_summary=[],
                diagnostics={
                    "source_info": source_info,
                    "reason": "missing_events_or_transactions",
                },
            )
            return state

        journeys = self._build_journeys(events_df)
        customer_revenue = self._customer_revenue(tx_df)
        channel_scores = self._compute_attribution_scores(journeys, customer_revenue)

        spend_by_channel = (
            campaign_df.groupby("channel")["spend"].sum().to_dict()
            if not campaign_df.empty and "channel" in campaign_df.columns and "spend" in campaign_df.columns
            else {}
        )

        channel_summary = self._build_channel_summary(channel_scores, spend_by_channel)
        ranking = sorted(channel_summary, key=lambda x: x["blended_revenue"], reverse=True)

        best_channel = ranking[0]["channel"] if ranking else ""
        worst_channel = ranking[-1]["channel"] if len(ranking) > 1 else best_channel

        channel_weights = self._normalized_weights(ranking)
        recommended_shift = self._recommend_shift(
            ranking=ranking,
            from_channel=worst_channel,
            to_channel=best_channel,
            cap=request.budget_shift_cap_percent,
        )

        touchpoint_position_chart = self._touchpoint_position_chart(journeys)
        budget_scenario_chart = self._budget_scenario_chart(ranking, recommended_shift)
        diagnostics = {
            "source_info": source_info,
            "data_points": {
                "event_rows": int(len(events_df.index)),
                "transaction_rows": int(len(tx_df.index)),
                "campaign_rows": int(len(campaign_df.index)),
            },
            "request": {
                "attribution_model": request.attribution_model,
                "metric": request.metric,
                "budget_shift_cap_percent": request.budget_shift_cap_percent,
            },
        }

        state.attribution_analysis = AttributionAnalysis(
            best_channel=best_channel,
            worst_channel=worst_channel,
            channel_weights=channel_weights,
            recommended_shift=recommended_shift,
            channel_summary=ranking,
            model_credit_chart=ranking,
            touchpoint_position_chart=touchpoint_position_chart,
            budget_scenario_chart=budget_scenario_chart,
            diagnostics=diagnostics,
            data_source="supabase" if any(source == "supabase" for source in source_info.values()) else "local",
        )
        return state

    def _build_request(self, state: AnalyticsState, request: AttributionRequest | None) -> AttributionRequest:
        if request:
            return request

        user_request = state.user_request or {}
        return AttributionRequest(
            budget_shift_cap_percent=int(user_request.get("budget_shift_cap_percent", 20) or 20),
            attribution_model=str(user_request.get("attribution_model", "linear") or "linear"),
            metric=str(user_request.get("metric", "revenue") or "revenue"),
        )

    def _load_dataframes(
        self,
        state: AnalyticsState,
    ) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict[str, str]]:
        events_remote, events_source = queries.get_dataset_dataframe_with_source(
            "events",
            prefer_remote=True,
        )
        transactions_remote, transactions_source = queries.get_dataset_dataframe_with_source(
            "transactions",
            prefer_remote=True,
        )
        campaigns_remote, campaigns_source = queries.get_dataset_dataframe_with_source(
            "campaigns",
            prefer_remote=True,
        )

        events_df = events_remote if not events_remote.empty else pd.DataFrame(state.events_data or [])
        tx_df = transactions_remote if not transactions_remote.empty else pd.DataFrame(state.transactions_data or [])
        campaign_df = campaigns_remote if not campaigns_remote.empty else pd.DataFrame(state.campaign_data or [])

        return events_df, tx_df, campaign_df, {
            "events": events_source,
            "transactions": transactions_source,
            "campaigns": campaigns_source,
        }

    def _build_journeys(self, events_df: pd.DataFrame) -> dict[str, list[str]]:
        df = events_df.copy()
        if "timestamp" in df.columns:
            df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

        sort_columns = [c for c in ["customer_id", "touch_order", "timestamp"] if c in df.columns]
        if sort_columns:
            df = df.sort_values(sort_columns)

        if "customer_id" not in df.columns or "channel" not in df.columns:
            return {}

        return (
            df.groupby("customer_id")["channel"]
            .apply(lambda s: [str(v) for v in s.dropna().tolist()])
            .to_dict()
        )

    def _customer_revenue(self, tx_df: pd.DataFrame) -> dict[str, float]:
        if "customer_id" not in tx_df.columns:
            return {}

        if "revenue" not in tx_df.columns:
            tx_df = tx_df.copy()
            tx_df["revenue"] = 0.0

        revenue_by_customer = tx_df.groupby("customer_id")["revenue"].sum()
        return {str(k): float(v) for k, v in revenue_by_customer.items()}

    def _compute_attribution_scores(
        self,
        journeys: dict[str, list[str]],
        customer_revenue: dict[str, float],
    ) -> dict[str, dict[str, float]]:
        first_touch: dict[str, float] = {}
        last_touch: dict[str, float] = {}
        linear: dict[str, float] = {}

        for customer_id, path in journeys.items():
            if not path:
                continue
            revenue = float(customer_revenue.get(customer_id, 0.0))
            if revenue <= 0:
                continue

            first = path[0]
            last = path[-1]
            first_touch[first] = first_touch.get(first, 0.0) + revenue
            last_touch[last] = last_touch.get(last, 0.0) + revenue

            per_touch = revenue / len(path)
            for channel in path:
                linear[channel] = linear.get(channel, 0.0) + per_touch

        all_channels = set(first_touch) | set(last_touch) | set(linear)
        scores: dict[str, dict[str, float]] = {}
        for channel in all_channels:
            first_value = first_touch.get(channel, 0.0)
            last_value = last_touch.get(channel, 0.0)
            linear_value = linear.get(channel, 0.0)
            blended = (0.25 * first_value) + (0.35 * last_value) + (0.40 * linear_value)
            scores[channel] = {
                "first_touch": first_value,
                "last_touch": last_value,
                "linear": linear_value,
                "blended": blended,
            }
        return scores

    def _build_channel_summary(
        self,
        channel_scores: dict[str, dict[str, float]],
        spend_by_channel: dict[str, float],
    ) -> list[dict[str, Any]]:
        summary: list[dict[str, Any]] = []
        for channel, metrics in channel_scores.items():
            spend = float(spend_by_channel.get(channel, 0.0))
            blended = float(metrics["blended"])
            blended_roas = blended / spend if spend > 0 else 0.0
            summary.append(
                {
                    "channel": channel,
                    "first_touch_revenue": round(float(metrics["first_touch"]), 2),
                    "last_touch_revenue": round(float(metrics["last_touch"]), 2),
                    "linear_revenue": round(float(metrics["linear"]), 2),
                    "blended_revenue": round(blended, 2),
                    "spend": round(spend, 2),
                    "blended_roas": round(blended_roas, 3),
                }
            )
        return summary

    def _normalized_weights(self, ranking: list[dict[str, Any]]) -> dict[str, float]:
        total = sum(float(row["blended_revenue"]) for row in ranking)
        if total <= 0:
            return {}
        return {
            str(row["channel"]): round(float(row["blended_revenue"]) / total, 4)
            for row in ranking
        }

    def _recommend_shift(
        self,
        ranking: list[dict[str, Any]],
        from_channel: str,
        to_channel: str,
        cap: int,
    ) -> dict[str, Any]:
        if len(ranking) < 2 or not from_channel or not to_channel:
            return {}

        best = ranking[0]
        worst = ranking[-1]
        best_roas = float(best.get("blended_roas", 0.0))
        worst_roas = float(worst.get("blended_roas", 0.0))

        if best_roas <= 0:
            percent = 5
        else:
            gap = max(best_roas - worst_roas, 0.0)
            suggested = max(5.0, gap * 10.0)
            percent = int(round(min(float(cap), suggested)))

        return {
            "from": from_channel,
            "to": to_channel,
            "percent": percent,
        }

    def _touchpoint_position_chart(self, journeys: dict[str, list[str]]) -> list[dict[str, Any]]:
        by_channel: dict[str, dict[str, int]] = {}

        for _, path in journeys.items():
            if not path:
                continue

            for index, channel in enumerate(path):
                if channel not in by_channel:
                    by_channel[channel] = {
                        "first_touch_count": 0,
                        "middle_touch_count": 0,
                        "last_touch_count": 0,
                    }

                if index == 0:
                    by_channel[channel]["first_touch_count"] += 1
                elif index == len(path) - 1:
                    by_channel[channel]["last_touch_count"] += 1
                else:
                    by_channel[channel]["middle_touch_count"] += 1

        out: list[dict[str, Any]] = []
        for channel, counts in by_channel.items():
            out.append(
                {
                    "channel": channel,
                    "first_touch_count": int(counts["first_touch_count"]),
                    "middle_touch_count": int(counts["middle_touch_count"]),
                    "last_touch_count": int(counts["last_touch_count"]),
                }
            )

        out.sort(
            key=lambda row: row["first_touch_count"] + row["middle_touch_count"] + row["last_touch_count"],
            reverse=True,
        )
        return out

    def _budget_scenario_chart(
        self,
        ranking: list[dict[str, Any]],
        recommended_shift: dict[str, Any],
    ) -> list[dict[str, Any]]:
        if not ranking:
            return []

        shift_percent = float(recommended_shift.get("percent", 0) or 0)
        from_channel = str(recommended_shift.get("from", ""))
        to_channel = str(recommended_shift.get("to", ""))

        rows: list[dict[str, Any]] = []
        for row in ranking:
            channel = str(row.get("channel", ""))
            spend = float(row.get("spend", 0.0) or 0.0)
            blended_roas = float(row.get("blended_roas", 0.0) or 0.0)
            blended_revenue = float(row.get("blended_revenue", 0.0) or 0.0)

            adjusted_spend = spend
            if shift_percent > 0 and from_channel and to_channel:
                if channel == from_channel:
                    adjusted_spend = max(0.0, spend * (1.0 - shift_percent / 100.0))
                elif channel == to_channel:
                    adjusted_spend = spend * (1.0 + shift_percent / 100.0)

            projected_revenue = adjusted_spend * blended_roas

            rows.append(
                {
                    "channel": channel,
                    "current_spend": round(spend, 2),
                    "projected_spend": round(adjusted_spend, 2),
                    "current_revenue": round(blended_revenue, 2),
                    "projected_revenue": round(projected_revenue, 2),
                }
            )

        return rows

