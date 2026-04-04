from __future__ import annotations
from typing import Dict, Any
from analytics_agent.state import AnalyticsState, Suggestion


MEASURABLE_KPIS = {
    "revenue",
    "roas",
    "new_customers",
    "ltv",
    "profit",
}


VAGUE_TERMS = {"growth", "scale", "bigger", "improve"}


def _normalize(s: str) -> str:
    return s.strip().lower().replace(" ", "_")


def kpi_validator(state: AnalyticsState) -> AnalyticsState:
    kpi = _normalize(state.primary_kpi or "")
    warnings = list(state.warnings)

    if not kpi or kpi in VAGUE_TERMS:
        warnings.append(
            "Primary KPI unclear. Please specify one measurable KPI: Revenue, ROAS, New customers, LTV, or Profit."
        )
        # Add a suggestion to define KPI
        state.suggestions_list.append(
            Suggestion(
                title="Define a measurable KPI",
                description="Clarify the primary KPI to guide modeling and decision-making.",
                reasoning="The request included a vague KPI (e.g., 'growth'). Models need a concrete target.",
                actions={"execute": "open:kpi_picker", "ignore": "dismiss"},
            )
        )
    elif kpi not in MEASURABLE_KPIS:
        warnings.append(
            f"KPI '{state.primary_kpi}' may be unrealistic or not directly measurable. Consider Revenue, ROAS, New customers, LTV, or Profit."
        )

    state.primary_kpi = kpi or state.primary_kpi
    state.warnings = warnings
    return state

