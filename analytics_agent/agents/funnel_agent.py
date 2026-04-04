from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from analytics_agent.state import AnalyticsState, FunnelAnalysis


@dataclass
class FunnelRequest:
    improvement_capture_rate: float = 0.2


class FunnelAgent:
    """Finds funnel leakage points and conversion uplift opportunity."""

    STAGES = ["impressions", "clicks", "landing_page_views", "add_to_cart", "purchases"]
    STAGE_LABELS = [
        "impressions_to_clicks",
        "clicks_to_landing_page",
        "landing_page_to_add_to_cart",
        "add_to_cart_to_purchase",
    ]

    def analyze(
        self,
        state: AnalyticsState,
        request: FunnelRequest | None = None,
    ) -> AnalyticsState:
        request = request or FunnelRequest()

        campaign_df = pd.DataFrame(state.campaign_data or [])
        events_df = pd.DataFrame(state.events_data or [])

        funnel = self._build_funnel(campaign_df, events_df)
        dropoffs = self._dropoff_series(funnel)

        largest_dropoff = ""
        dropoff_percent = 0.0
        if dropoffs:
            largest_dropoff, dropoff_percent = max(dropoffs.items(), key=lambda item: item[1])

        uplift = self._predicted_uplift(
            funnel=funnel,
            largest_dropoff=largest_dropoff,
            capture_rate=request.improvement_capture_rate,
        )

        state.funnel_analysis = FunnelAnalysis(
            funnel={k: int(v) for k, v in funnel.items()},
            largest_dropoff=largest_dropoff,
            dropoff_percent=round(dropoff_percent, 2),
            predicted_conversion_uplift_if_fixed=round(uplift, 3),
        )
        return state

    def _build_funnel(self, campaign_df: pd.DataFrame, events_df: pd.DataFrame) -> dict[str, int]:
        if not campaign_df.empty:
            available = {stage: campaign_df[stage].sum() for stage in self.STAGES if stage in campaign_df.columns}
            if len(available) >= 3:
                return {stage: int(max(0.0, float(available.get(stage, 0.0)))) for stage in self.STAGES}

        event_map = {
            "impression": "impressions",
            "click": "clicks",
            "landing_page_view": "landing_page_views",
            "add_to_cart": "add_to_cart",
            "purchase": "purchases",
        }

        funnel = {stage: 0 for stage in self.STAGES}
        if events_df.empty or "event_type" not in events_df.columns:
            return funnel

        counts = events_df["event_type"].value_counts().to_dict()
        for event_type, stage in event_map.items():
            funnel[stage] = int(counts.get(event_type, 0))
        return funnel

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
