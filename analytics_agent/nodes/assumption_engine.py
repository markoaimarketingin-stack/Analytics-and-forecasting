from __future__ import annotations
from typing import Dict, Any, List
from analytics_agent.state import AnalyticsState


def _score_data_availability(state: AnalyticsState) -> float:
    points = 0
    if state.channel_performance:
        points += 0.3
    if state.historical_data:
        points += 0.25
    if state.conversion_rates:
        points += 0.2
    if state.revenue_data:
        points += 0.15
    if state.cost_structure:
        points += 0.1
    return min(points, 1.0)


def _score_consistency(state: AnalyticsState) -> float:
    # Placeholder: better if variance data provided
    return 0.7 if state.historical_data else 0.5


def _score_stability(state: AnalyticsState) -> float:
    return 0.7 if state.structured_context.get("market_stability", "medium") == "high" else 0.5


def _score_assumption_risk(state: AnalyticsState) -> float:
    # Lower is better; convert to confidence contribution
    risky = sum(1 for a in state.forecast_results.assumptions if any(w in a.lower() for w in ["assume", "estimated"]))
    return max(0.0, 1.0 - min(1.0, risky * 0.1))


def _score_external_uncertainty(state: AnalyticsState) -> float:
    ext = state.structured_context.get("external_uncertainty", "medium")
    return {"low": 0.9, "medium": 0.7, "high": 0.5}.get(ext, 0.7)


def assumption_engine(state: AnalyticsState) -> AnalyticsState:
    assumptions: List[Dict[str, Any]] = []

    # Gather assumptions from previous nodes
    for a in state.forecast_results.assumptions:
        assumptions.append({"assumption": a, "risk": "medium"})

    # Data confidence calculation
    w_avail, w_consist, w_stab, w_risk, w_ext = 0.3, 0.2, 0.2, 0.2, 0.1
    score = (
        _score_data_availability(state) * w_avail
        + _score_consistency(state) * w_consist
        + _score_stability(state) * w_stab
        + _score_assumption_risk(state) * w_risk
        + _score_external_uncertainty(state) * w_ext
    )
    state.assumptions = assumptions
    state.confidence_score = round(score * 100, 1)

    return state
