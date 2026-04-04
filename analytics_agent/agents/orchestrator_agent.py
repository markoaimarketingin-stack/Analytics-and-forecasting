from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from analytics_agent.agents.attribution_agent import AttributionAgent
from analytics_agent.agents.cohort_agent import CohortAgent
from analytics_agent.agents.forecast_agent import ForecastAgent, ForecastRequest
from analytics_agent.agents.funnel_agent import FunnelAgent
from analytics_agent.agents.scenario_agent import ScenarioAgent
from analytics_agent.db import queries
from analytics_agent.state import AnalyticsState, build_default_state


@dataclass
class OrchestratorRequest:
    user_request: dict[str, Any] = field(default_factory=dict)
    run_agents: list[str] | None = None


class OrchestratorAgent:
    """Chief analytics strategist that coordinates specialist agents end-to-end."""

    DEFAULT_ORDER = ["attribution", "funnel", "cohort", "forecast", "scenario"]

    def __init__(self) -> None:
        self.attribution_agent = AttributionAgent()
        self.funnel_agent = FunnelAgent()
        self.cohort_agent = CohortAgent()
        self.forecast_agent = ForecastAgent()
        self.scenario_agent = ScenarioAgent()

    def run(self, request: OrchestratorRequest | None = None, state: AnalyticsState | None = None) -> AnalyticsState:
        request = request or OrchestratorRequest()
        state = state or build_default_state()

        state.user_request = dict(request.user_request or {})
        self._load_data(state)

        ordered_agents = self._resolve_agent_order(request.run_agents)
        for agent_name in ordered_agents:
            state = self.run_agent(agent_name, state)

        self._build_recommendations(state)
        self._build_executive_summary(state)
        return state

    def run_agent(self, agent_name: str, state: AnalyticsState) -> AnalyticsState:
        name = agent_name.strip().lower()

        if name == "attribution":
            return self.attribution_agent.analyze(state)
        if name == "funnel":
            return self.funnel_agent.analyze(state)
        if name == "cohort":
            return self.cohort_agent.analyze(state)
        if name == "forecast":
            horizon = int(state.user_request.get("horizon_days", 30))
            return self.forecast_agent.analyze(state, ForecastRequest(horizon_days=horizon))
        if name == "scenario":
            return self.scenario_agent.analyze(state)

        return state

    def _load_data(self, state: AnalyticsState) -> None:
        if state.campaign_data is None:
            state.campaign_data = queries.get_campaign_data()
        if state.customer_data is None and state.customers_data is None:
            state.customer_data = queries.get_customers_data()
            state.customers_data = state.customer_data
        elif state.customer_data is None:
            state.customer_data = state.customers_data
        elif state.customers_data is None:
            state.customers_data = state.customer_data

        if state.events_data is None:
            state.events_data = queries.get_events_data()
        if state.transactions_data is None:
            state.transactions_data = queries.get_transactions_data()
        if state.retention_data is None:
            state.retention_data = queries.get_retention_data()

    def _resolve_agent_order(self, run_agents: list[str] | None) -> list[str]:
        if not run_agents:
            return self.DEFAULT_ORDER

        normalized = [name.strip().lower() for name in run_agents if str(name).strip()]
        selected = [name for name in self.DEFAULT_ORDER if name in normalized]
        return selected or self.DEFAULT_ORDER

    def _build_recommendations(self, state: AnalyticsState) -> None:
        recommendations: list[str] = []

        if state.attribution_analysis and state.attribution_analysis.recommended_shift:
            shift = state.attribution_analysis.recommended_shift
            recommendations.append(
                f"Shift {shift.get('percent', 0)}% budget from {shift.get('from', 'low performers')} to {shift.get('to', 'top channel')}"
            )

        if state.funnel_analysis and state.funnel_analysis.largest_dropoff:
            recommendations.append(
                f"Improve {state.funnel_analysis.largest_dropoff.replace('_', ' ')} to capture conversion upside"
            )

        if state.cohort_analysis and state.cohort_analysis.high_value_segment:
            recommendations.append(f"Target {state.cohort_analysis.high_value_segment} customers with retention offers")

        state.recommendations = recommendations

    def _build_executive_summary(self, state: AnalyticsState) -> None:
        if not state.forecast_analysis:
            state.executive_summary = "Forecast is unavailable because campaign data is missing."
            return

        revenue = state.forecast_analysis.next_30_day_revenue
        confidence = state.forecast_analysis.confidence

        best_channel = (
            state.attribution_analysis.best_channel
            if state.attribution_analysis and state.attribution_analysis.best_channel
            else "the strongest channel"
        )
        channel_weight = (
            max(state.attribution_analysis.channel_weights.values())
            if state.attribution_analysis and state.attribution_analysis.channel_weights
            else 0.0
        )
        shift = state.attribution_analysis.recommended_shift if state.attribution_analysis else {}

        dropoff = state.funnel_analysis.largest_dropoff if state.funnel_analysis else "funnel leakage"
        uplift = (
            state.funnel_analysis.predicted_conversion_uplift_if_fixed
            if state.funnel_analysis
            else 0.0
        )

        segment = (
            state.cohort_analysis.high_value_segment
            if state.cohort_analysis and state.cohort_analysis.high_value_segment
            else "high-LTV segments"
        )

        best_case_revenue = (
            state.scenario_analysis.best_case.get("revenue", revenue)
            if state.scenario_analysis
            else revenue
        )

        state.executive_summary = (
            f"Revenue is forecasted to reach ${revenue:,.0f} over the next 30 days with {confidence}% confidence. "
            f"{best_channel} currently drives {channel_weight:.0%} of attributed revenue"
            f" and should receive an additional {shift.get('percent', 0)}% budget allocation. "
            f"The largest growth opportunity is reducing {dropoff.replace('_', '-')}, "
            f"which could increase conversions by {uplift:.0%}. "
            f"{segment} customers show the strongest retention and LTV. "
            f"Under the best-case scenario, revenue could rise to ${best_case_revenue:,.0f}."
        )

