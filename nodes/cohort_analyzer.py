from __future__ import annotations
from typing import Dict, List
from analytics_agent.state import AnalyticsState


def cohort_analyzer(state: AnalyticsState) -> AnalyticsState:
    # historical_data expected: list of {cohort: "YYYY-MM", month: int, customers: int, revenue: float}
    cohorts: Dict[str, Dict[str, float]] = {}
    ltv_by_cohort: Dict[str, float] = {}
    if not state.historical_data:
        state.cohort_results = {"message": "No historical data provided."}
        return state

    for row in state.historical_data:
        cohort = str(row.get("cohort", "unknown"))
        revenue = float(row.get("revenue", 0.0))
        customers = float(row.get("customers", 0.0))
        cohorts.setdefault(cohort, {"revenue": 0.0, "customers": 0.0})
        cohorts[cohort]["revenue"] += revenue
        cohorts[cohort]["customers"] += customers

    retention_curve: Dict[str, float] = {}
    for cohort, vals in cohorts.items():
        cust = vals["customers"] or 1.0
        ltv = vals["revenue"] / cust
        ltv_by_cohort[cohort] = round(ltv, 2)
        # naive retention estimate from revenue spread
        retention_curve[cohort] = min(1.0, max(0.0, vals["revenue"] / (cust * (state.revenue_data.get("aov", 1.0)))))

    state.cohort_results = {
        "ltv_by_cohort": ltv_by_cohort,
        "retention_index": {k: round(v, 3) for k, v in retention_curve.items()},
        "notes": "Cohort metrics are simplified; provide monthly cohort series for more precision.",
    }
    return state
