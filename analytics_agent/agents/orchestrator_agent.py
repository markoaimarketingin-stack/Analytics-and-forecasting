from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from analytics_agent.agents.attribution_agent import AttributionAgent
from analytics_agent.agents.budget_allocator_agent import (
    BudgetAllocatorAgent,
    BudgetAllocatorRequest,
)
from analytics_agent.agents.cohort_agent import CohortAgent
from analytics_agent.agents.forecast_agent import ForecastAgent, ForecastRequest
from analytics_agent.agents.funnel_agent import FunnelAgent
from analytics_agent.agents.scenario_agent import ScenarioAgent, ScenarioRequest
from analytics_agent.db import queries
from analytics_agent.state import AnalyticsState, build_default_state


@dataclass
class OrchestratorRequest:
    user_request: dict[str, Any] = field(default_factory=dict)
    run_agents: list[str] | None = None


class OrchestratorAgent:
    """Chief analytics strategist that coordinates specialist agents end-to-end."""

    DEFAULT_ORDER = ["attribution", "funnel", "cohort", "forecast", "scenario", "budget_allocator"]

    def __init__(self) -> None:
        # Agents are created lazily on first use to avoid blocking startup
        # with Supabase CSV downloads before the server is ready.
        self._attribution_agent: AttributionAgent | None = None
        self._funnel_agent: FunnelAgent | None = None
        self._cohort_agent: CohortAgent | None = None
        self._forecast_agent: ForecastAgent | None = None
        self._scenario_agent: ScenarioAgent | None = None
        self._budget_allocator_agent: BudgetAllocatorAgent | None = None

    @property
    def attribution_agent(self) -> AttributionAgent:
        if self._attribution_agent is None:
            self._attribution_agent = AttributionAgent()
        return self._attribution_agent

    @property
    def funnel_agent(self) -> FunnelAgent:
        if self._funnel_agent is None:
            self._funnel_agent = FunnelAgent()
        return self._funnel_agent

    @property
    def cohort_agent(self) -> CohortAgent:
        if self._cohort_agent is None:
            self._cohort_agent = CohortAgent()
        return self._cohort_agent

    @property
    def forecast_agent(self) -> ForecastAgent:
        if self._forecast_agent is None:
            self._forecast_agent = ForecastAgent()
        return self._forecast_agent

    @property
    def scenario_agent(self) -> ScenarioAgent:
        if self._scenario_agent is None:
            self._scenario_agent = ScenarioAgent()
        return self._scenario_agent

    @property
    def budget_allocator_agent(self) -> BudgetAllocatorAgent:
        if self._budget_allocator_agent is None:
            self._budget_allocator_agent = BudgetAllocatorAgent()
        return self._budget_allocator_agent

    def run(self, request: OrchestratorRequest | None = None, state: AnalyticsState | None = None) -> AnalyticsState:
        request = request or OrchestratorRequest()
        state = state or build_default_state()

        state.user_request = dict(request.user_request or {})
        ordered_agents = self._resolve_agent_order(request.run_agents)
        client_id = str(state.user_request.get("client_id") or "").strip()
        if client_id:
            missing = queries.get_missing_client_datasets_for_agents(client_id, ordered_agents)
            if missing:
                raise ValueError(
                    queries.build_missing_client_dataset_message(client_id, missing)
                )
        self._load_data(state, ordered_agents)
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
            return self.forecast_agent.analyze(
                state,
                ForecastRequest(
                    horizon_days=horizon,
                    kpi_metric=str(state.user_request.get("kpi_metric", "revenue")),
                    channel=self._normalize_filter(state.user_request.get("channel"), default="all"),
                    campaign_type=self._normalize_filter(state.user_request.get("campaign_type"), default="all"),
                    campaign_id=self._normalize_filter(state.user_request.get("campaign_id"), default="all"),
                    spend_change_pct=float(state.user_request.get("spend_change_pct", 0)),
                    ctr_lift_pct=float(state.user_request.get("ctr_lift_pct", 0)),
                    conversion_lift_pct=float(state.user_request.get("conversion_lift_pct", 0)),
                    cpc_change_pct=float(state.user_request.get("cpc_change_pct", 0)),
                    aov_change_pct=float(state.user_request.get("aov_change_pct", 0)),
                    seasonality_factor=float(state.user_request.get("seasonality_factor", 1.0)),
                ),
            )
        if name == "scenario":
            return self.scenario_agent.analyze(
                state,
                ScenarioRequest(
                    horizon_days=int(state.user_request.get("horizon_days", 90)),
                    kpi_metric=str(state.user_request.get("kpi_metric", "revenue")),
                    channel=self._normalize_filter(state.user_request.get("channel"), default="all"),
                    campaign_type=self._normalize_filter(state.user_request.get("campaign_type"), default="all"),
                    campaign_id=self._normalize_filter(state.user_request.get("campaign_id"), default="all"),
                    base_spend_change_pct=float(state.user_request.get("base_spend_change_pct", 0)),
                    base_ctr_lift_pct=float(state.user_request.get("base_ctr_lift_pct", 0)),
                    base_conversion_lift_pct=float(state.user_request.get("base_conversion_lift_pct", 0)),
                    base_aov_change_pct=float(state.user_request.get("base_aov_change_pct", 0)),
                    seasonality_factor=float(state.user_request.get("seasonality_factor", 1.0)),
                ),
            )

        if name in {"budget_allocator", "budget"}:
            return self.budget_allocator_agent.analyze(
                state,
                BudgetAllocatorRequest(
                    total_budget=float(state.user_request.get("total_budget", 0) or 0),
                    objective=str(state.user_request.get("objective", "profit") or "profit"),
                    risk_tolerance=str(state.user_request.get("risk_tolerance", "balanced") or "balanced"),
                    max_shift_pct=float(state.user_request.get("max_shift_pct", 20) or 20),
                    min_channel_pct=float(state.user_request.get("min_channel_pct", 5) or 5),
                    max_channel_pct=float(state.user_request.get("max_channel_pct", 60) or 60),
                    channel=self._normalize_filter(state.user_request.get("channel"), default="all"),
                    campaign_type=self._normalize_filter(state.user_request.get("campaign_type"), default="all"),
                    campaign_id=self._normalize_filter(state.user_request.get("campaign_id"), default="all"),
                ),
            )

        return state

    def _normalize_filter(self, value: Any, default: str = "all") -> str:
        if value is None:
            return default
        text = str(value).strip()
        if not text:
            return default
        if text.casefold() in {"none", "null", "nil", "n/a", "na", "all channels", "all channel"}:
            return default
        return text

    def _load_data(self, state: AnalyticsState, ordered_agents: list[str]) -> None:
        forecast_only = ordered_agents == ["forecast"]
        scenario_only = ordered_agents == ["scenario"]
        budget_only = ordered_agents == ["budget_allocator"]
        client_id = str(state.user_request.get("client_id") or "").strip() or None

        # Store DataFrames (not lists) so agents can check .empty on state fields.
        if state.campaign_data is None:
            if client_id:
                state.campaign_data = queries.get_campaign_dataframe(client_id=client_id)
            elif forecast_only or scenario_only or budget_only:
                state.campaign_data = queries.get_campaign_dataframe()
            else:
                state.campaign_data = queries.get_campaign_dataframe()

        if forecast_only or scenario_only or budget_only:
            return

        if state.customer_data is None and state.customers_data is None:
            df = queries.get_customers_dataframe(client_id=client_id)
            state.customer_data = df
            state.customers_data = df
        elif state.customer_data is None:
            state.customer_data = state.customers_data
        elif state.customers_data is None:
            state.customers_data = state.customer_data

        if state.events_data is None:
            state.events_data = queries.get_events_dataframe(client_id=client_id)
        if state.transactions_data is None:
            state.transactions_data = queries.get_transactions_dataframe(client_id=client_id)
        if state.retention_data is None:
            state.retention_data = queries.get_retention_dataframe(client_id=client_id)

    def _resolve_agent_order(self, run_agents: list[str] | None) -> list[str]:
        if not run_agents:
            return self.DEFAULT_ORDER

        normalized: list[str] = []
        for raw in run_agents:
            name = str(raw).strip().lower()
            if not name:
                continue
            if name == "budget":
                name = "budget_allocator"
            normalized.append(name)
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

        if state.budget_allocation_analysis and state.budget_allocation_analysis.channel_allocations:
            top = state.budget_allocation_analysis.channel_allocations[0]
            recommendations.append(
                f"Allocate ${top.get('recommended_spend', 0):,.0f} to {top.get('channel', 'top channel')} for {state.budget_allocation_analysis.objective} optimization"
            )

        state.recommendations = recommendations

    def _build_executive_summary(self, state: AnalyticsState) -> None:
        if not state.forecast_analysis:
            state.executive_summary = "Run Analysis."
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