from __future__ import annotations
from typing import Any, Dict
from langgraph.graph import StateGraph, END
from analytics_agent.state import AnalyticsState
from analytics_agent.nodes.kpi_validator import kpi_validator
from analytics_agent.nodes.cac_roas_estimator import cac_roas_estimator
from analytics_agent.nodes.roi_forecaster import roi_forecaster
from analytics_agent.nodes.scenario_modeler import scenario_modeler
from analytics_agent.nodes.cohort_analyzer import cohort_analyzer
from analytics_agent.nodes.funnel_modeler import funnel_modeler
from analytics_agent.nodes.revenue_attribution_modeler import revenue_attribution_modeler
from analytics_agent.nodes.assumption_engine import assumption_engine
from analytics_agent.nodes.suggestion_generator import suggestion_generator


# Capability list (must match UI exactly)
CAPABILITIES = [
    "ROI forecasting",
    "CAC/ROAS estimation",
    "Scenario modeling",
    "KPI definition",
]


def _has_historical(state: AnalyticsState) -> bool:
    return len(state.historical_data) > 0


def build_graph() -> Any:
    sg = StateGraph(AnalyticsState)

    sg.add_node("kpi_validator", kpi_validator)
    sg.add_node("load_performance_data", lambda s: s)  # Placeholder: data assumed loaded via API payload
    sg.add_node("cac_roas_estimator", cac_roas_estimator)
    sg.add_node("roi_forecaster", roi_forecaster)
    sg.add_node("scenario_modeler", scenario_modeler)
    sg.add_node("cohort_analyzer", cohort_analyzer)
    sg.add_node("funnel_modeler", funnel_modeler)
    sg.add_node("revenue_attribution_modeler", revenue_attribution_modeler)
    sg.add_node("assumption_engine", assumption_engine)
    sg.add_node("suggestion_generator", suggestion_generator)

    sg.set_entry_point("kpi_validator")

    sg.add_edge("kpi_validator", "load_performance_data")
    sg.add_edge("load_performance_data", "cac_roas_estimator")
    sg.add_edge("cac_roas_estimator", "roi_forecaster")
    sg.add_edge("roi_forecaster", "scenario_modeler")

    # Conditional cohort analysis
    sg.add_conditional_edges(
        "scenario_modeler",
        lambda s: "has_hist" if _has_historical(s) else "no_hist",
        {
            "has_hist": "cohort_analyzer",
            "no_hist": "funnel_modeler",
        },
    )

    sg.add_edge("cohort_analyzer", "funnel_modeler")
    sg.add_edge("funnel_modeler", "revenue_attribution_modeler")
    sg.add_edge("revenue_attribution_modeler", "assumption_engine")
    sg.add_edge("assumption_engine", "suggestion_generator")
    sg.add_edge("suggestion_generator", END)

    return sg.compile()
