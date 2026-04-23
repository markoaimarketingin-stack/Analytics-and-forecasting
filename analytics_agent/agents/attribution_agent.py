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
    channel: str = "all"
    campaign_type: str = "all"
    start_date: str | None = None
    end_date: str | None = None


class AttributionAgent:
    """Determines channel-level revenue credit and budget reallocation guidance."""

    def analyze(
        self,
        state: AnalyticsState,
        request: AttributionRequest | None = None,
    ) -> AnalyticsState:
        request = self._build_request(state, request)

        events_df, tx_df, campaign_df, source_info = self._load_dataframes(state)

        if events_df.empty or tx_df.empty or campaign_df.empty:
            state.attribution_analysis = AttributionAnalysis(
                diagnostics={
                    "source_info": source_info,
                    "reason": "supabase_data_unavailable_or_empty",
                },
                data_source="supabase",
            )
            return state

        campaign_df, events_df, tx_df, filters_applied = self._apply_filters(
            campaign_df=campaign_df,
            events_df=events_df,
            tx_df=tx_df,
            request=request,
        )

        if events_df.empty or tx_df.empty or campaign_df.empty:
            state.attribution_analysis = AttributionAnalysis(
                diagnostics={
                    "source_info": source_info,
                    "reason": "no_rows_after_filters",
                    "filters_applied": filters_applied,
                },
                filters_applied=filters_applied,
                data_source="supabase",
            )
            return state

        journeys = self._build_journeys(events_df)
        customer_revenue = self._customer_revenue(tx_df)
        channel_scores = self._compute_attribution_scores(journeys, customer_revenue, request.attribution_model)
        customer_counts = self._customer_counts_by_channel(journeys, customer_revenue)
        campaign_metrics = self._campaign_metrics_by_channel(campaign_df)

        channel_summary = self._build_channel_summary(
            channel_scores=channel_scores,
            customer_counts=customer_counts,
            campaign_metrics=campaign_metrics,
        )

        ranking = self._rank_channels(channel_summary, request.metric)
        best_channel = ranking[0]["channel"] if ranking else ""
        worst_channel = ranking[-1]["channel"] if len(ranking) > 1 else best_channel

        channel_weights = self._normalized_weights(ranking)
        recommended_shift = self._recommend_shift(
            ranking=ranking,
            from_channel=worst_channel,
            to_channel=best_channel,
            cap=request.budget_shift_cap_percent,
            metric=request.metric,
        )

        state.attribution_analysis = AttributionAnalysis(
            best_channel=best_channel,
            worst_channel=worst_channel,
            channel_weights=channel_weights,
            recommended_shift=recommended_shift,
            summary_metrics=self._summary_metrics(ranking),
            channel_summary=ranking,
            model_credit_chart=ranking,
            touchpoint_position_chart=self._touchpoint_position_chart(journeys),
            budget_scenario_chart=self._budget_scenario_chart(ranking, recommended_shift, request.metric),
            efficiency_chart=self._efficiency_chart(ranking),
            conversion_quality_chart=self._conversion_quality_chart(ranking),
            diagnostics={
                "source_info": source_info,
                "data_points": {
                    "event_rows": int(len(events_df.index)),
                    "transaction_rows": int(len(tx_df.index)),
                    "campaign_rows": int(len(campaign_df.index)),
                },
                "filters_applied": filters_applied,
                "request": {
                    "attribution_model": request.attribution_model,
                    "metric": request.metric,
                    "budget_shift_cap_percent": request.budget_shift_cap_percent,
                },
            },
            filters_applied=filters_applied,
            data_source="supabase",
        )
        return state

    def _build_request(self, state: AnalyticsState, request: AttributionRequest | None) -> AttributionRequest:
        if request:
            return request

        user_request = state.user_request or {}
        return AttributionRequest(
            budget_shift_cap_percent=int(user_request.get("budget_shift_cap_percent", 20) or 20),
            attribution_model=str(user_request.get("attribution_model", "linear") or "linear").lower(),
            metric=str(user_request.get("metric", "revenue") or "revenue").lower(),
            channel=str(user_request.get("channel", "all") or "all"),
            campaign_type=str(user_request.get("campaign_type", "all") or "all"),
            start_date=user_request.get("start_date"),
            end_date=user_request.get("end_date"),
        )

    def _load_dataframes(self, state: AnalyticsState) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict[str, str]]:
        client_id = str((state.user_request or {}).get("client_id") or "").strip() or None
        events_df, events_source = queries.get_dataset_dataframe_with_source("events", prefer_remote=not client_id, client_id=client_id)
        tx_df, tx_source = queries.get_dataset_dataframe_with_source("transactions", prefer_remote=not client_id, client_id=client_id)
        campaign_df, campaign_source = queries.get_dataset_dataframe_with_source("campaigns", prefer_remote=not client_id, client_id=client_id)

        return (
            events_df,
            tx_df,
            campaign_df,
            {
                "events": events_source,
                "transactions": tx_source,
                "campaigns": campaign_source,
            },
        )

    def _apply_filters(
        self,
        campaign_df: pd.DataFrame,
        events_df: pd.DataFrame,
        tx_df: pd.DataFrame,
        request: AttributionRequest,
    ) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict[str, Any]]:
        filtered_campaign = campaign_df.copy()
        filtered_events = events_df.copy()
        filtered_tx = tx_df.copy()

        channel = str(request.channel or "all").strip()
        campaign_type = str(request.campaign_type or "all").strip()

        if channel and channel.lower() != "all":
            if "channel" in filtered_campaign.columns:
                campaign_series = filtered_campaign["channel"].astype(str).str.strip().str.casefold()
                filtered_campaign = filtered_campaign[campaign_series == channel.casefold()]
            if "channel" in filtered_events.columns:
                events_series = filtered_events["channel"].astype(str).str.strip().str.casefold()
                filtered_events = filtered_events[events_series == channel.casefold()]

        if campaign_type and campaign_type.lower() != "all" and "campaign_type" in filtered_campaign.columns:
            campaign_type_series = filtered_campaign["campaign_type"].astype(str).str.strip().str.casefold()
            filtered_campaign = filtered_campaign[campaign_type_series == campaign_type.casefold()]

        start_dt = pd.to_datetime(request.start_date, errors="coerce") if request.start_date else pd.NaT
        end_dt = pd.to_datetime(request.end_date, errors="coerce") if request.end_date else pd.NaT

        if "date" in filtered_campaign.columns and (not pd.isna(start_dt) or not pd.isna(end_dt)):
            filtered_campaign["date"] = pd.to_datetime(filtered_campaign["date"], errors="coerce")
            if not pd.isna(start_dt):
                filtered_campaign = filtered_campaign[filtered_campaign["date"] >= start_dt]
            if not pd.isna(end_dt):
                filtered_campaign = filtered_campaign[filtered_campaign["date"] <= end_dt]

        if "timestamp" in filtered_events.columns and (not pd.isna(start_dt) or not pd.isna(end_dt)):
            filtered_events["timestamp"] = pd.to_datetime(filtered_events["timestamp"], errors="coerce")
            if not pd.isna(start_dt):
                filtered_events = filtered_events[filtered_events["timestamp"] >= start_dt]
            if not pd.isna(end_dt):
                filtered_events = filtered_events[filtered_events["timestamp"] <= end_dt]

        if "purchase_date" in filtered_tx.columns and (not pd.isna(start_dt) or not pd.isna(end_dt)):
            filtered_tx["purchase_date"] = pd.to_datetime(filtered_tx["purchase_date"], errors="coerce")
            if not pd.isna(start_dt):
                filtered_tx = filtered_tx[filtered_tx["purchase_date"] >= start_dt]
            if not pd.isna(end_dt):
                filtered_tx = filtered_tx[filtered_tx["purchase_date"] <= end_dt]

        return filtered_campaign, filtered_events, filtered_tx, {
            "channel": channel if channel else "all",
            "campaign_type": campaign_type if campaign_type else "all",
            "start_date": request.start_date or "",
            "end_date": request.end_date or "",
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

        tx_df = tx_df.copy()
        tx_df["revenue"] = pd.to_numeric(tx_df["revenue"], errors="coerce").fillna(0.0)
        revenue_by_customer = tx_df.groupby("customer_id")["revenue"].sum()
        return {str(k): float(v) for k, v in revenue_by_customer.items()}

    def _compute_attribution_scores(
        self,
        journeys: dict[str, list[str]],
        customer_revenue: dict[str, float],
        attribution_model: str,
    ) -> dict[str, dict[str, float]]:
        first_touch: dict[str, float] = {}
        last_touch: dict[str, float] = {}
        linear: dict[str, float] = {}
        time_decay: dict[str, float] = {}

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

            weights = [2 ** idx for idx in range(len(path))]
            total_weight = float(sum(weights)) or 1.0
            for idx, channel in enumerate(path):
                weighted_credit = revenue * (weights[idx] / total_weight)
                time_decay[channel] = time_decay.get(channel, 0.0) + weighted_credit

        all_channels = set(first_touch) | set(last_touch) | set(linear) | set(time_decay)
        scores: dict[str, dict[str, float]] = {}
        for channel in all_channels:
            first_value = first_touch.get(channel, 0.0)
            last_value = last_touch.get(channel, 0.0)
            linear_value = linear.get(channel, 0.0)
            time_decay_value = time_decay.get(channel, 0.0)
            blended = (0.20 * first_value) + (0.30 * last_value) + (0.30 * linear_value) + (0.20 * time_decay_value)

            selected = linear_value
            if attribution_model == "first_click":
                selected = first_value
            elif attribution_model == "last_click":
                selected = last_value
            elif attribution_model == "time_decay":
                selected = time_decay_value

            scores[channel] = {
                "first_touch": first_value,
                "last_touch": last_value,
                "linear": linear_value,
                "time_decay": time_decay_value,
                "blended": blended,
                "selected": selected,
            }

        return scores

    def _customer_counts_by_channel(
        self,
        journeys: dict[str, list[str]],
        customer_revenue: dict[str, float],
    ) -> dict[str, dict[str, float]]:
        out: dict[str, dict[str, float]] = {}
        for customer_id, path in journeys.items():
            if not path:
                continue
            revenue = float(customer_revenue.get(customer_id, 0.0) or 0.0)
            if revenue <= 0:
                continue

            first_channel = path[0]
            for channel in set(path):
                if channel not in out:
                    out[channel] = {"attributed_customers": 0.0, "first_touch_customers": 0.0}
                out[channel]["attributed_customers"] += 1.0

            if first_channel not in out:
                out[first_channel] = {"attributed_customers": 0.0, "first_touch_customers": 0.0}
            out[first_channel]["first_touch_customers"] += 1.0

        return out

    def _campaign_metrics_by_channel(self, campaign_df: pd.DataFrame) -> dict[str, dict[str, float]]:
        if campaign_df.empty or "channel" not in campaign_df.columns:
            return {}

        numeric_cols = [
            col
            for col in ["spend", "impressions", "clicks", "landing_page_views", "add_to_cart", "purchases", "revenue"]
            if col in campaign_df.columns
        ]
        grouped = campaign_df.groupby("channel", as_index=False)[numeric_cols].sum() if numeric_cols else pd.DataFrame()

        out: dict[str, dict[str, float]] = {}
        for _, row in grouped.iterrows():
            channel = str(row.get("channel", "Unknown"))
            spend = float(row.get("spend", 0.0) or 0.0)
            impressions = float(row.get("impressions", 0.0) or 0.0)
            clicks = float(row.get("clicks", 0.0) or 0.0)
            purchases = float(row.get("purchases", 0.0) or 0.0)
            revenue = float(row.get("revenue", 0.0) or 0.0)

            out[channel] = {
                "spend": spend,
                "impressions": impressions,
                "clicks": clicks,
                "purchases": purchases,
                "campaign_revenue": revenue,
                "ctr": (clicks / impressions) if impressions > 0 else 0.0,
                "conversion_rate": (purchases / clicks) if clicks > 0 else 0.0,
                "cpc": (spend / clicks) if clicks > 0 else 0.0,
                "cpm": ((spend / impressions) * 1000.0) if impressions > 0 else 0.0,
                "aov": (revenue / purchases) if purchases > 0 else 0.0,
            }

        return out

    def _build_channel_summary(
        self,
        channel_scores: dict[str, dict[str, float]],
        customer_counts: dict[str, dict[str, float]],
        campaign_metrics: dict[str, dict[str, float]],
    ) -> list[dict[str, Any]]:
        summary: list[dict[str, Any]] = []
        for channel, scores in channel_scores.items():
            campaign = campaign_metrics.get(channel, {})
            customers = customer_counts.get(channel, {})

            spend = float(campaign.get("spend", 0.0) or 0.0)
            blended = float(scores.get("blended", 0.0) or 0.0)
            blended_roas = (blended / spend) if spend > 0 else 0.0
            blended_roi = ((blended - spend) / spend) if spend > 0 else 0.0

            purchases = float(campaign.get("purchases", 0.0) or 0.0)
            first_touch_customers = float(customers.get("first_touch_customers", 0.0) or 0.0)
            attributed_customers = float(customers.get("attributed_customers", 0.0) or 0.0)

            cac = (spend / first_touch_customers) if first_touch_customers > 0 else 0.0
            cpa = (spend / purchases) if purchases > 0 else 0.0
            revenue_per_customer = (blended / attributed_customers) if attributed_customers > 0 else 0.0

            summary.append(
                {
                    "channel": channel,
                    "first_touch_revenue": round(float(scores.get("first_touch", 0.0)), 2),
                    "last_touch_revenue": round(float(scores.get("last_touch", 0.0)), 2),
                    "linear_revenue": round(float(scores.get("linear", 0.0)), 2),
                    "time_decay_revenue": round(float(scores.get("time_decay", 0.0)), 2),
                    "selected_revenue": round(float(scores.get("selected", 0.0)), 2),
                    "blended_revenue": round(blended, 2),
                    "spend": round(spend, 2),
                    "impressions": int(round(float(campaign.get("impressions", 0.0) or 0.0))),
                    "clicks": int(round(float(campaign.get("clicks", 0.0) or 0.0))),
                    "purchases": int(round(purchases)),
                    "attributed_customers": int(round(attributed_customers)),
                    "first_touch_customers": int(round(first_touch_customers)),
                    "ctr": round(float(campaign.get("ctr", 0.0) or 0.0), 4),
                    "conversion_rate": round(float(campaign.get("conversion_rate", 0.0) or 0.0), 4),
                    "cpc": round(float(campaign.get("cpc", 0.0) or 0.0), 4),
                    "cpm": round(float(campaign.get("cpm", 0.0) or 0.0), 4),
                    "aov": round(float(campaign.get("aov", 0.0) or 0.0), 2),
                    "blended_roas": round(blended_roas, 3),
                    "blended_roi": round(blended_roi, 4),
                    "cac": round(cac, 2),
                    "cpa": round(cpa, 2),
                    "revenue_per_customer": round(revenue_per_customer, 2),
                }
            )

        return summary

    def _rank_channels(self, rows: list[dict[str, Any]], metric: str) -> list[dict[str, Any]]:
        metric_key_map = {
            "revenue": ("blended_revenue", True),
            "roas": ("blended_roas", True),
            "roi": ("blended_roi", True),
            "cac": ("cac", False),
            "cpa": ("cpa", False),
            "conversions": ("purchases", True),
        }
        key, descending = metric_key_map.get(metric, ("blended_revenue", True))

        ranked = []
        for row in rows:
            metric_value = float(row.get(key, 0.0) or 0.0)
            ranked.append({**row, "selected_metric": key, "selected_metric_value": round(metric_value, 4)})

        return sorted(ranked, key=lambda x: float(x.get("selected_metric_value", 0.0) or 0.0), reverse=descending)

    def _normalized_weights(self, ranking: list[dict[str, Any]]) -> dict[str, float]:
        total = sum(float(row.get("blended_revenue", 0.0) or 0.0) for row in ranking)
        if total <= 0:
            return {}
        return {
            str(row["channel"]): round(float(row.get("blended_revenue", 0.0) or 0.0) / total, 4)
            for row in ranking
        }

    def _recommend_shift(
        self,
        ranking: list[dict[str, Any]],
        from_channel: str,
        to_channel: str,
        cap: int,
        metric: str,
    ) -> dict[str, Any]:
        if len(ranking) < 2 or not from_channel or not to_channel:
            return {}

        best = ranking[0]
        worst = ranking[-1]
        key = str(best.get("selected_metric", "blended_revenue"))
        best_score = float(best.get("selected_metric_value", 0.0) or 0.0)
        worst_score = float(worst.get("selected_metric_value", 0.0) or 0.0)

        if key in {"cac", "cpa"}:
            gap_ratio = max(worst_score - best_score, 0.0) / max(abs(worst_score), 1.0)
        else:
            gap_ratio = max(best_score - worst_score, 0.0) / max(abs(best_score), 1.0)

        suggested = max(5.0, min(100.0, gap_ratio * 60.0))
        percent = int(round(min(float(cap), suggested)))

        return {
            "from": from_channel,
            "to": to_channel,
            "percent": percent,
            "driver_metric": metric,
        }

    def _summary_metrics(self, ranking: list[dict[str, Any]]) -> dict[str, float]:
        if not ranking:
            return {}

        total_spend = sum(float(row.get("spend", 0.0) or 0.0) for row in ranking)
        total_revenue = sum(float(row.get("blended_revenue", 0.0) or 0.0) for row in ranking)
        total_impressions = sum(float(row.get("impressions", 0.0) or 0.0) for row in ranking)
        total_clicks = sum(float(row.get("clicks", 0.0) or 0.0) for row in ranking)
        total_purchases = sum(float(row.get("purchases", 0.0) or 0.0) for row in ranking)
        total_first_touch_customers = sum(float(row.get("first_touch_customers", 0.0) or 0.0) for row in ranking)

        blended_roas = (total_revenue / total_spend) if total_spend > 0 else 0.0
        blended_roi = ((total_revenue - total_spend) / total_spend) if total_spend > 0 else 0.0
        blended_cac = (total_spend / total_first_touch_customers) if total_first_touch_customers > 0 else 0.0
        blended_cpa = (total_spend / total_purchases) if total_purchases > 0 else 0.0
        ctr = (total_clicks / total_impressions) if total_impressions > 0 else 0.0
        conversion_rate = (total_purchases / total_clicks) if total_clicks > 0 else 0.0
        aov = (total_revenue / total_purchases) if total_purchases > 0 else 0.0
        cpc = (total_spend / total_clicks) if total_clicks > 0 else 0.0
        cpm = ((total_spend / total_impressions) * 1000.0) if total_impressions > 0 else 0.0

        return {
            "total_spend": round(total_spend, 2),
            "attributed_revenue": round(total_revenue, 2),
            "blended_roas": round(blended_roas, 4),
            "blended_roi": round(blended_roi, 4),
            "blended_cac": round(blended_cac, 2),
            "blended_cpa": round(blended_cpa, 2),
            "ctr": round(ctr, 4),
            "conversion_rate": round(conversion_rate, 4),
            "aov": round(aov, 2),
            "cpc": round(cpc, 4),
            "cpm": round(cpm, 4),
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
        metric: str,
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
            blended_roi = float(row.get("blended_roi", 0.0) or 0.0)

            adjusted_spend = spend
            if shift_percent > 0 and from_channel and to_channel:
                if channel == from_channel:
                    adjusted_spend = max(0.0, spend * (1.0 - shift_percent / 100.0))
                elif channel == to_channel:
                    adjusted_spend = spend * (1.0 + shift_percent / 100.0)

            projected_revenue = adjusted_spend * blended_roas
            projected_profit = projected_revenue - adjusted_spend
            projected_roi = (projected_profit / adjusted_spend) if adjusted_spend > 0 else 0.0

            metric_value = {
                "revenue": projected_revenue,
                "roas": (projected_revenue / adjusted_spend) if adjusted_spend > 0 else 0.0,
                "roi": projected_roi,
                "cac": float(row.get("cac", 0.0) or 0.0),
                "cpa": float(row.get("cpa", 0.0) or 0.0),
                "conversions": float(row.get("purchases", 0.0) or 0.0),
            }.get(metric, projected_revenue)

            rows.append(
                {
                    "channel": channel,
                    "current_spend": round(spend, 2),
                    "projected_spend": round(adjusted_spend, 2),
                    "current_revenue": round(blended_revenue, 2),
                    "projected_revenue": round(projected_revenue, 2),
                    "current_roi": round(blended_roi, 4),
                    "projected_roi": round(projected_roi, 4),
                    "selected_metric": metric,
                    "selected_metric_value": round(float(metric_value), 4),
                }
            )

        return rows

    def _efficiency_chart(self, ranking: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {
                "channel": str(row.get("channel", "")),
                "roas": float(row.get("blended_roas", 0.0) or 0.0),
                "roi": float(row.get("blended_roi", 0.0) or 0.0),
                "cac": float(row.get("cac", 0.0) or 0.0),
                "cpa": float(row.get("cpa", 0.0) or 0.0),
                "cpc": float(row.get("cpc", 0.0) or 0.0),
                "cpm": float(row.get("cpm", 0.0) or 0.0),
            }
            for row in ranking
        ]

    def _conversion_quality_chart(self, ranking: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {
                "channel": str(row.get("channel", "")),
                "ctr": float(row.get("ctr", 0.0) or 0.0),
                "conversion_rate": float(row.get("conversion_rate", 0.0) or 0.0),
                "aov": float(row.get("aov", 0.0) or 0.0),
                "purchases": float(row.get("purchases", 0.0) or 0.0),
            }
            for row in ranking
        ]
