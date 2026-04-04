from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd

from analytics_agent.state import AnalyticsState, AttributionAnalysis


@dataclass
class AttributionRequest:
    budget_shift_cap_percent: int = 20


class AttributionAgent:
    """Determines channel-level revenue credit and budget reallocation guidance."""

    def analyze(
        self,
        state: AnalyticsState,
        request: AttributionRequest | None = None,
    ) -> AnalyticsState:
        request = request or AttributionRequest()

        events_df = pd.DataFrame(state.events_data or [])
        tx_df = pd.DataFrame(state.transactions_data or [])
        campaign_df = pd.DataFrame(state.campaign_data or [])

        if events_df.empty or tx_df.empty:
            state.attribution_analysis = AttributionAnalysis(
                best_channel="",
                worst_channel="",
                channel_weights={},
                recommended_shift={},
                channel_summary=[],
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

        state.attribution_analysis = AttributionAnalysis(
            best_channel=best_channel,
            worst_channel=worst_channel,
            channel_weights=channel_weights,
            recommended_shift=recommended_shift,
            channel_summary=ranking,
        )
        return state

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
