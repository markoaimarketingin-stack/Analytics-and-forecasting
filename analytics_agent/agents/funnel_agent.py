from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd

from analytics_agent.db import queries
from analytics_agent.state import AnalyticsState, FunnelAnalysis


@dataclass
class FunnelRequest:
    improvement_capture_rate: float = 0.2
    channel: str | None = None
    campaign_type: str | None = None
    funnel_type: str | None = None
    segment: str | None = None
    event_type: str | None = None
    time_period: str = "month"


class FunnelAgent:
    """Finds funnel leakage points and conversion uplift opportunity."""

    STAGES = ["impressions", "clicks", "landing_page_views", "add_to_cart", "purchases"]
    STAGE_LABELS = [
        "impressions_to_clicks",
        "clicks_to_landing_page",
        "landing_page_to_add_to_cart",
        "add_to_cart_to_purchase",
    ]
    EVENT_TO_STAGE = {
        "impression": "impressions",
        "click": "clicks",
        "landing_page_view": "landing_page_views",
        "add_to_cart": "add_to_cart",
        "purchase": "purchases",
    }
    TIME_PERIOD_DAYS = {
        "week": 7,
        "month": 30,
        "quarter": 90,
        "year": 365,
        "all": None,
    }
    STAGE_DISPLAY = {
        "impressions": "Impression",
        "clicks": "Click",
        "landing_page_views": "Touchpoint",
        "add_to_cart": "Add to Cart",
        "purchases": "Purchase",
    }
    STAGE_PAIRS = [
        ("impressions", "clicks", "impressions_to_clicks"),
        ("clicks", "landing_page_views", "clicks_to_landing_page"),
        ("landing_page_views", "add_to_cart", "landing_page_to_add_to_cart"),
        ("add_to_cart", "purchases", "add_to_cart_to_purchase"),
    ]

    def analyze(
        self,
        state: AnalyticsState,
        request: FunnelRequest | None = None,
    ) -> AnalyticsState:
        request = self._build_request(state, request)
        campaign_df, events_df, customers_df, transactions_df, source_info = self._load_dataframes(state)
        filtered_campaign_df, filtered_events_df, filters_applied = self._apply_filters(
            campaign_df=campaign_df,
            events_df=events_df,
            customers_df=customers_df,
            request=request,
        )

        funnel, used_source = self._build_funnel(filtered_campaign_df, filtered_events_df)
        dropoffs = self._dropoff_series(funnel)
        stage_details = self._stage_details(funnel)

        largest_dropoff = ""
        dropoff_percent = 0.0
        if dropoffs:
            largest_dropoff, dropoff_percent = max(dropoffs.items(), key=lambda item: item[1])

        uplift = self._predicted_uplift(
            funnel=funnel,
            largest_dropoff=largest_dropoff,
            capture_rate=request.improvement_capture_rate,
        )
        estimated_recovered_purchases = self._estimated_recovered_purchases(
            funnel=funnel,
            largest_dropoff=largest_dropoff,
            capture_rate=request.improvement_capture_rate,
        )

        impressions = float(funnel.get("impressions", 0))
        purchases = float(funnel.get("purchases", 0))
        baseline_conversion_rate = 0.0 if impressions <= 0 else purchases / impressions

        diagnostics = {
            "dropoff_series": {k: round(v, 2) for k, v in dropoffs.items()},
            "baseline_conversion_rate": round(baseline_conversion_rate, 4),
            "estimated_recovered_purchases": int(round(estimated_recovered_purchases)),
            "data_points": {
                "campaign_rows": int(len(filtered_campaign_df.index)),
                "event_rows": int(len(filtered_events_df.index)),
                "customer_rows": int(len(customers_df.index)),
                "transaction_rows": int(len(transactions_df.index)),
            },
            "source_info": source_info,
        }

        primary_funnel_chart = self._build_primary_funnel_chart(funnel)
        stage_waterfall_chart = self._build_stage_waterfall_chart(funnel)
        channel_comparison_chart = self._build_channel_comparison_chart(filtered_campaign_df)
        segment_comparison_chart = self._build_segment_comparison_chart(
            filtered_events_df,
            customers_df,
        )
        stage_time_chart = self._build_stage_time_chart(filtered_events_df)
        revenue_opportunity_chart = self._build_revenue_opportunity_chart(
            funnel,
            filtered_campaign_df,
            filtered_events_df,
        )
        uplift_scenarios_chart = self._build_uplift_scenarios_chart(
            funnel,
            largest_dropoff,
            filtered_campaign_df,
        )

        state.funnel_analysis = FunnelAnalysis(
            funnel={k: int(v) for k, v in funnel.items()},
            largest_dropoff=largest_dropoff,
            dropoff_percent=round(dropoff_percent, 2),
            predicted_conversion_uplift_if_fixed=round(uplift, 3),
            stage_dropoffs={k: round(v, 2) for k, v in dropoffs.items()},
            stage_details=stage_details,
            filters_applied=filters_applied,
            data_source=used_source,
            diagnostics=diagnostics,
            primary_funnel_chart=primary_funnel_chart,
            stage_waterfall_chart=stage_waterfall_chart,
            channel_comparison_chart=channel_comparison_chart,
            segment_comparison_chart=segment_comparison_chart,
            stage_time_chart=stage_time_chart,
            revenue_opportunity_chart=revenue_opportunity_chart,
            uplift_scenarios_chart=uplift_scenarios_chart,
        )
        return state

    def _build_request(self, state: AnalyticsState, request: FunnelRequest | None) -> FunnelRequest:
        if request:
            return request

        user_request = state.user_request or {}
        campaign_type = user_request.get("campaign_type") or user_request.get("funnel_type")
        funnel_type = user_request.get("funnel_type") or campaign_type

        return FunnelRequest(
            improvement_capture_rate=float(user_request.get("improvement_capture_rate", 0.2)),
            channel=user_request.get("channel"),
            campaign_type=campaign_type,
            funnel_type=funnel_type,
            segment=user_request.get("segment"),
            event_type=user_request.get("event_type"),
            time_period=str(user_request.get("time_period", "month") or "month"),
        )

    def _load_dataframes(
        self,
        state: AnalyticsState,
    ) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, dict[str, str]]:
        client_id = str((state.user_request or {}).get("client_id") or "").strip() or None
        campaign_remote, campaign_source = queries.get_dataset_dataframe_with_source(
            "campaigns",
            prefer_remote=not client_id,
            client_id=client_id,
        )
        events_remote, events_source = queries.get_dataset_dataframe_with_source(
            "events",
            prefer_remote=not client_id,
            client_id=client_id,
        )
        customers_remote, customers_source = queries.get_dataset_dataframe_with_source(
            "customers",
            prefer_remote=not client_id,
            client_id=client_id,
        )
        transactions_remote, transactions_source = queries.get_dataset_dataframe_with_source(
            "transactions",
            prefer_remote=not client_id,
            client_id=client_id,
        )

        campaign_df = campaign_remote if not campaign_remote.empty else pd.DataFrame(state.campaign_data or [])
        events_df = events_remote if not events_remote.empty else pd.DataFrame(state.events_data or [])

        customer_records = state.customer_data or state.customers_data or []
        customers_df = customers_remote if not customers_remote.empty else pd.DataFrame(customer_records)
        transactions_df = transactions_remote if not transactions_remote.empty else pd.DataFrame(state.transactions_data or [])

        return campaign_df, events_df, customers_df, transactions_df, {
            "campaigns": campaign_source,
            "events": events_source,
            "customers": customers_source,
            "transactions": transactions_source,
        }

    def _apply_filters(
        self,
        campaign_df: pd.DataFrame,
        events_df: pd.DataFrame,
        customers_df: pd.DataFrame,
        request: FunnelRequest,
    ) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
        filtered_campaign = campaign_df.copy()
        filtered_events = events_df.copy()

        channel = self._normalize_filter_value(request.channel)
        campaign_type = self._normalize_filter_value(request.campaign_type or request.funnel_type)
        segment = self._normalize_filter_value(request.segment)
        event_type = self._normalize_filter_value(request.event_type)
        time_period = str(request.time_period or "month").strip().lower()

        if channel:
            filtered_campaign = self._filter_by_value(filtered_campaign, "channel", channel)
            filtered_events = self._filter_by_value(filtered_events, "channel", channel)

        if campaign_type:
            filtered_campaign = self._filter_by_value(filtered_campaign, "campaign_type", campaign_type)

        if segment:
            filtered_campaign = self._filter_by_value(filtered_campaign, "segment", segment)
            filtered_events = self._filter_events_by_customer_segment(filtered_events, customers_df, segment)
            if "segment" not in filtered_campaign.columns:
                filtered_campaign = pd.DataFrame()

        if event_type:
            filtered_events = self._filter_by_value(filtered_events, "event_type", event_type)

        filtered_campaign = self._apply_time_period(filtered_campaign, "date", time_period)
        filtered_events = self._apply_time_period(filtered_events, "timestamp", time_period)

        filters_applied = {
            "channel": channel or "all",
            "campaign_type": campaign_type or "all",
            "segment": segment or "all",
            "event_type": event_type or "all",
            "time_period": time_period,
        }
        return filtered_campaign, filtered_events, filters_applied

    def _normalize_filter_value(self, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip()
        if not normalized:
            return None
        if normalized.lower() in {"all", "all_users", "all_customers"}:
            return None
        return normalized

    def _filter_by_value(self, df: pd.DataFrame, column: str, value: str) -> pd.DataFrame:
        if df.empty or column not in df.columns:
            return df
        series = df[column].astype(str)
        return df[series.str.casefold() == value.casefold()]

    def _filter_events_by_customer_segment(
        self,
        events_df: pd.DataFrame,
        customers_df: pd.DataFrame,
        segment: str,
    ) -> pd.DataFrame:
        if events_df.empty or customers_df.empty:
            return events_df
        if "customer_id" not in events_df.columns:
            return events_df
        if "segment" not in customers_df.columns or "customer_id" not in customers_df.columns:
            return events_df

        customers = customers_df.copy()
        customers["segment"] = customers["segment"].astype(str)
        matched_ids = customers[
            customers["segment"].str.casefold() == segment.casefold()
        ]["customer_id"]
        return events_df[events_df["customer_id"].isin(matched_ids)]

    def _apply_time_period(self, df: pd.DataFrame, datetime_column: str, time_period: str) -> pd.DataFrame:
        if df.empty or datetime_column not in df.columns:
            return df

        lookback_days = self.TIME_PERIOD_DAYS.get(time_period, 30)
        if lookback_days is None:
            return df

        parsed = pd.to_datetime(df[datetime_column], errors="coerce")
        valid_mask = parsed.notna()
        if not valid_mask.any():
            return df

        latest = parsed[valid_mask].max()
        if pd.isna(latest):
            return df

        window_start = latest - pd.Timedelta(days=int(lookback_days))
        return df[(parsed >= window_start) & valid_mask]

    def _build_funnel(self, campaign_df: pd.DataFrame, events_df: pd.DataFrame) -> tuple[dict[str, int], str]:
        if not campaign_df.empty:
            available = {stage: campaign_df[stage].sum() for stage in self.STAGES if stage in campaign_df.columns}
            if len(available) >= 3:
                funnel = {stage: int(max(0.0, float(available.get(stage, 0.0)))) for stage in self.STAGES}
                return funnel, "campaigns"

        funnel = {stage: 0 for stage in self.STAGES}
        if events_df.empty or "event_type" not in events_df.columns:
            return funnel, "events"

        counts = events_df["event_type"].value_counts().to_dict()
        for event_type, stage in self.EVENT_TO_STAGE.items():
            funnel[stage] = int(counts.get(event_type, 0))
        return funnel, "events"

    def _stage_details(self, funnel: dict[str, int]) -> list[dict[str, float | int | str]]:
        details: list[dict[str, float | int | str]] = []
        first_value = float(funnel.get(self.STAGES[0], 0))

        for index, stage in enumerate(self.STAGES):
            current = float(funnel.get(stage, 0))
            previous = float(funnel.get(self.STAGES[index - 1], 0)) if index > 0 else current

            if index == 0:
                dropoff = 0.0
                conversion_prev = 100.0 if current > 0 else 0.0
            else:
                dropoff = 0.0 if previous <= 0 else max(0.0, ((previous - current) / previous) * 100)
                conversion_prev = 0.0 if previous <= 0 else max(0.0, min(100.0, (current / previous) * 100))

            conversion_entry = 0.0 if first_value <= 0 else max(0.0, min(100.0, (current / first_value) * 100))

            details.append(
                {
                    "stage": stage,
                    "value": int(current),
                    "dropoff_from_previous_pct": round(dropoff, 2),
                    "conversion_from_previous_pct": round(conversion_prev, 2),
                    "conversion_from_entry_pct": round(conversion_entry, 2),
                }
            )

        return details

    def _dropoff_series(self, funnel: dict[str, int]) -> dict[str, float]:
        values = [funnel.get(stage, 0) for stage in self.STAGES]
        dropoffs: dict[str, float] = {}

        for i, label in enumerate(self.STAGE_LABELS):
            start = float(values[i])
            end = float(values[i + 1])
            dropoffs[label] = 0.0 if start <= 0 else max(0.0, ((start - end) / start) * 100)

        return dropoffs

    def _predicted_uplift(
        self,
        funnel: dict[str, int],
        largest_dropoff: str,
        capture_rate: float,
    ) -> float:
        if not largest_dropoff:
            return 0.0

        stage_pairs: dict[str, tuple[str, str]] = {
            "impressions_to_clicks": ("impressions", "clicks"),
            "clicks_to_landing_page": ("clicks", "landing_page_views"),
            "landing_page_to_add_to_cart": ("landing_page_views", "add_to_cart"),
            "add_to_cart_to_purchase": ("add_to_cart", "purchases"),
        }
        start_stage, end_stage = stage_pairs[largest_dropoff]
        start = float(funnel.get(start_stage, 0))
        end = float(funnel.get(end_stage, 0))
        purchases = float(funnel.get("purchases", 0))

        if start <= 0 or purchases <= 0:
            return 0.0

        leakage = max(0.0, start - end)
        recovered_flow = leakage * max(0.0, min(1.0, capture_rate))

        downstream_rate = purchases / max(end, 1.0)
        incremental_purchases = recovered_flow * downstream_rate
        uplift = incremental_purchases / purchases
        return max(0.0, min(0.5, uplift))

    def _estimated_recovered_purchases(
        self,
        funnel: dict[str, int],
        largest_dropoff: str,
        capture_rate: float,
    ) -> float:
        if not largest_dropoff:
            return 0.0

        stage_pairs: dict[str, tuple[str, str]] = {
            "impressions_to_clicks": ("impressions", "clicks"),
            "clicks_to_landing_page": ("clicks", "landing_page_views"),
            "landing_page_to_add_to_cart": ("landing_page_views", "add_to_cart"),
            "add_to_cart_to_purchase": ("add_to_cart", "purchases"),
        }
        start_stage, end_stage = stage_pairs[largest_dropoff]
        start = float(funnel.get(start_stage, 0))
        end = float(funnel.get(end_stage, 0))
        leakage = max(0.0, start - end)
        return leakage * max(0.0, min(1.0, capture_rate))

    def _build_primary_funnel_chart(self, funnel: dict[str, int]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        entry = float(funnel.get(self.STAGES[0], 0))

        for index, stage in enumerate(self.STAGES):
            users = float(funnel.get(stage, 0))
            if index == 0:
                previous = users
                conversion_previous = 1.0 if users > 0 else 0.0
                dropoff_previous = 0.0
            else:
                previous = float(funnel.get(self.STAGES[index - 1], 0))
                conversion_previous = 0.0 if previous <= 0 else users / previous
                dropoff_previous = 0.0 if previous <= 0 else max(0.0, 1.0 - conversion_previous)

            conversion_entry = 0.0 if entry <= 0 else users / entry
            rows.append(
                {
                    "stage": stage,
                    "stage_label": self.STAGE_DISPLAY.get(stage, stage),
                    "users": int(users),
                    "conversion_from_previous": round(conversion_previous, 4),
                    "dropoff_from_previous": round(dropoff_previous, 4),
                    "conversion_from_entry": round(conversion_entry, 4),
                }
            )
        return rows

    def _build_stage_waterfall_chart(self, funnel: dict[str, int]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for from_stage, to_stage, key in self.STAGE_PAIRS:
            start = int(funnel.get(from_stage, 0))
            end = int(funnel.get(to_stage, 0))
            lost_users = max(0, start - end)
            rows.append(
                {
                    "transition": key,
                    "transition_label": f"{self.STAGE_DISPLAY[from_stage]} -> {self.STAGE_DISPLAY[to_stage]}",
                    "lost_users": -lost_users,
                    "lost_users_abs": lost_users,
                }
            )
        return rows

    def _build_channel_comparison_chart(self, campaign_df: pd.DataFrame) -> list[dict[str, Any]]:
        if campaign_df.empty or "channel" not in campaign_df.columns:
            return []

        df = campaign_df.copy()
        metric_cols = [
            "impressions",
            "clicks",
            "landing_page_views",
            "purchases",
        ]
        for col in metric_cols:
            if col not in df.columns:
                df[col] = 0

        grouped = (
            df.groupby("channel", dropna=False)[metric_cols]
            .sum(numeric_only=True)
            .reset_index()
        )

        rows: list[dict[str, Any]] = []
        for _, row in grouped.iterrows():
            impressions = float(row.get("impressions", 0))
            clicks = float(row.get("clicks", 0))
            lp_views = float(row.get("landing_page_views", 0))
            purchases = float(row.get("purchases", 0))
            rows.append(
                {
                    "channel": str(row.get("channel", "Unknown")),
                    "click_rate": round(0.0 if impressions <= 0 else clicks / impressions, 4),
                    "final_conversion_rate": round(0.0 if impressions <= 0 else purchases / impressions, 4),
                    "purchase_rate": round(0.0 if lp_views <= 0 else purchases / lp_views, 4),
                }
            )

        rows.sort(key=lambda item: item.get("final_conversion_rate", 0), reverse=True)
        return rows

    def _build_segment_comparison_chart(
        self,
        events_df: pd.DataFrame,
        customers_df: pd.DataFrame,
    ) -> list[dict[str, Any]]:
        if events_df.empty or customers_df.empty:
            return []
        if "customer_id" not in events_df.columns:
            return []
        if "customer_id" not in customers_df.columns or "segment" not in customers_df.columns:
            return []

        merged = events_df.merge(
            customers_df[["customer_id", "segment"]],
            on="customer_id",
            how="left",
        )
        if merged.empty:
            return []

        counts = (
            merged["segment"]
            .dropna()
            .astype(str)
            .value_counts()
        )
        segments = counts.head(2).index.tolist()
        if len(segments) < 2:
            return []

        rows: list[dict[str, Any]] = []
        for segment in segments:
            segment_df = merged[merged["segment"].astype(str) == segment]
            if "event_type" not in segment_df.columns:
                continue
            funnel = {stage: 0 for stage in self.STAGES}
            event_counts = segment_df["event_type"].value_counts().to_dict()
            for event_type, stage in self.EVENT_TO_STAGE.items():
                funnel[stage] = int(event_counts.get(event_type, 0))

            for item in self._build_primary_funnel_chart(funnel):
                rows.append(
                    {
                        "segment": segment,
                        "stage": item["stage"],
                        "stage_label": item["stage_label"],
                        "users": item["users"],
                    }
                )
        return rows

    def _build_stage_time_chart(self, events_df: pd.DataFrame) -> list[dict[str, Any]]:
        if events_df.empty:
            return []
        needed_cols = {"customer_id", "event_type", "timestamp"}
        if not needed_cols.issubset(set(events_df.columns)):
            return []

        df = events_df.copy()
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
        df = df.dropna(subset=["timestamp"])
        if df.empty:
            return []

        rows: list[dict[str, Any]] = []
        for from_event, to_event, key in [
            ("impression", "click", "impressions_to_clicks"),
            ("click", "landing_page_view", "clicks_to_landing_page"),
            ("landing_page_view", "add_to_cart", "landing_page_to_add_to_cart"),
            ("add_to_cart", "purchase", "add_to_cart_to_purchase"),
        ]:
            first_from = (
                df[df["event_type"].astype(str) == from_event]
                .sort_values("timestamp")
                .groupby("customer_id", as_index=False)
                .first()[["customer_id", "timestamp"]]
                .rename(columns={"timestamp": "from_ts"})
            )
            first_to = (
                df[df["event_type"].astype(str) == to_event]
                .sort_values("timestamp")
                .groupby("customer_id", as_index=False)
                .first()[["customer_id", "timestamp"]]
                .rename(columns={"timestamp": "to_ts"})
            )
            merged = first_from.merge(first_to, on="customer_id", how="inner")
            if merged.empty:
                continue

            hours = (merged["to_ts"] - merged["from_ts"]).dt.total_seconds() / 3600.0
            hours = hours[hours >= 0]
            if hours.empty:
                continue

            rows.append(
                {
                    "transition": key,
                    "transition_label": f"{self.STAGE_DISPLAY[self.EVENT_TO_STAGE[from_event]]} -> {self.STAGE_DISPLAY[self.EVENT_TO_STAGE[to_event]]}",
                    "median_hours": round(float(hours.median()), 2),
                }
            )
        return rows

    def _build_revenue_opportunity_chart(
        self,
        funnel: dict[str, int],
        campaign_df: pd.DataFrame,
        events_df: pd.DataFrame,
    ) -> list[dict[str, Any]]:
        aov = self._estimate_aov(campaign_df, events_df)
        purchases = float(funnel.get("purchases", 0))

        rows: list[dict[str, Any]] = []
        for from_stage, to_stage, key in self.STAGE_PAIRS:
            start = float(funnel.get(from_stage, 0))
            end = float(funnel.get(to_stage, 0))
            leakage = max(0.0, start - end)
            downstream_rate = 0.0 if end <= 0 else purchases / end
            estimated_lost_purchases = leakage * downstream_rate
            estimated_lost_revenue = estimated_lost_purchases * aov
            rows.append(
                {
                    "transition": key,
                    "transition_label": f"{self.STAGE_DISPLAY[from_stage]} -> {self.STAGE_DISPLAY[to_stage]}",
                    "estimated_lost_purchases": int(round(estimated_lost_purchases)),
                    "estimated_lost_revenue": round(float(estimated_lost_revenue), 2),
                }
            )
        rows.sort(key=lambda item: item.get("estimated_lost_revenue", 0.0), reverse=True)
        return rows

    def _build_uplift_scenarios_chart(
        self,
        funnel: dict[str, int],
        largest_dropoff: str,
        campaign_df: pd.DataFrame,
    ) -> list[dict[str, Any]]:
        if not largest_dropoff:
            return []

        aov = self._estimate_aov(campaign_df, pd.DataFrame())
        rows: list[dict[str, Any]] = []
        for rate in [0.05, 0.1, 0.2]:
            recovered = self._estimated_recovered_purchases(funnel, largest_dropoff, rate)
            rows.append(
                {
                    "improvement_rate": int(rate * 100),
                    "incremental_purchases": int(round(recovered)),
                    "incremental_revenue": round(float(recovered * aov), 2),
                }
            )
        return rows

    def _estimate_aov(self, campaign_df: pd.DataFrame, events_df: pd.DataFrame) -> float:
        if not campaign_df.empty and "aov" in campaign_df.columns:
            aov_series = pd.to_numeric(campaign_df["aov"], errors="coerce").dropna()
            if not aov_series.empty:
                return max(1.0, float(aov_series.median()))

        if not campaign_df.empty and {"revenue", "purchases"}.issubset(set(campaign_df.columns)):
            revenue = float(pd.to_numeric(campaign_df["revenue"], errors="coerce").fillna(0).sum())
            purchases = float(pd.to_numeric(campaign_df["purchases"], errors="coerce").fillna(0).sum())
            if purchases > 0:
                return max(1.0, revenue / purchases)

        if not events_df.empty:
            purchases = int((events_df.get("event_type") == "purchase").sum()) if "event_type" in events_df.columns else 0
            if purchases > 0:
                return 100.0
        return 100.0

