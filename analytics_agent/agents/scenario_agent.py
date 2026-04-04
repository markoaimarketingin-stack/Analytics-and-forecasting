from __future__ import annotations

from dataclasses import dataclass

from analytics_agent.state import AnalyticsState, ScenarioAnalysis


@dataclass
class ScenarioRequest:
    best_case_spend_change: float = 0.10
    worst_case_spend_change: float = -0.10


class ScenarioAgent:
    """Builds best/base/worst forward scenarios from forecast assumptions."""

    def analyze(
        self,
        state: AnalyticsState,
        request: ScenarioRequest | None = None,
    ) -> AnalyticsState:
        request = request or ScenarioRequest()

        if state.forecast_analysis is None:
            state.scenario_analysis = ScenarioAnalysis()
            return state

        base_revenue = float(state.forecast_analysis.next_30_day_revenue)
        base_roi = float(state.forecast_analysis.predicted_roi)

        funnel_uplift = (
            float(state.funnel_analysis.predicted_conversion_uplift_if_fixed)
            if state.funnel_analysis
            else 0.0
        )
        retention = (
            float(state.cohort_analysis.three_month_retention)
            if state.cohort_analysis
            else 0.5
        )
        best_weight = (
            max(state.attribution_analysis.channel_weights.values())
            if state.attribution_analysis and state.attribution_analysis.channel_weights
            else 0.33
        )

        best_multiplier = self._scenario_multiplier(
            spend_change=request.best_case_spend_change,
            conversion_effect=funnel_uplift,
            retention=retention,
            attribution_strength=best_weight,
            positive=True,
        )
        worst_multiplier = self._scenario_multiplier(
            spend_change=request.worst_case_spend_change,
            conversion_effect=funnel_uplift,
            retention=retention,
            attribution_strength=best_weight,
            positive=False,
        )

        best_case = {
            "revenue": round(base_revenue * best_multiplier, 2),
            "roi": round(base_roi * (1 + (best_multiplier - 1) * 0.9), 3),
        }
        base_case = {
            "revenue": round(base_revenue, 2),
            "roi": round(base_roi, 3),
        }
        worst_case = {
            "revenue": round(base_revenue * worst_multiplier, 2),
            "roi": round(base_roi * (1 - (1 - worst_multiplier) * 0.9), 3),
        }

        state.scenario_analysis = ScenarioAnalysis(
            best_case=best_case,
            base_case=base_case,
            worst_case=worst_case,
        )
        return state

    def _scenario_multiplier(
        self,
        spend_change: float,
        conversion_effect: float,
        retention: float,
        attribution_strength: float,
        positive: bool,
    ) -> float:
        conversion_component = conversion_effect if positive else -0.5 * conversion_effect
        retention_component = (retention - 0.5) * (0.3 if positive else 0.2)
        attribution_component = (attribution_strength - 0.33) * (0.25 if positive else 0.15)

        raw = 1.0 + spend_change + conversion_component + retention_component + attribution_component
        return max(0.6, min(1.5, raw))
