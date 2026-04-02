from __future__ import annotations
from typing import List
from analytics_agent.state import AnalyticsState, ScenarioRow


VARIATION = 0.20  # +/- 20%


def scenario_modeler(state: AnalyticsState) -> AnalyticsState:
    base_spend = float(state.metrics.get("total_spend", 0.0))
    base_roas = float(state.metrics.get("roas", 0.0))
    base_cvr = float(state.conversion_rates.get("conversion_rate", 0.03))
    base_ctr = float(state.conversion_rates.get("ctr", 0.015))
    base_cpc = float(state.structured_context.get("cpc", 0.5))
    base_ret = float(state.structured_context.get("retention", 0.2))
    cogs_rate = float(state.cost_structure.get("variable_cogs_rate", 0.0))

    rows: List[ScenarioRow] = []
    for label, mult in (
        ("Best Case", 1 + VARIATION),
        ("Base Case", 1.0),
        ("Worst Case", 1 - VARIATION),
    ):
        cvr = base_cvr * mult
        ctr = base_ctr * mult
        cpc = max(base_cpc / mult, 0.01)
        retention = min(max(base_ret * mult, 0.0), 1.0)

        spend = base_spend
        # Simple linkage: ROAS improves with higher cvr/ctr and lower cpc
        roas_adj = (cvr / base_cvr if base_cvr else 1.0) * (ctr / base_ctr if base_ctr else 1.0) * (
            (base_cpc / cpc) if cpc else 1.0
        )
        roas = base_roas * roas_adj
        revenue = spend * roas
        cogs = revenue * cogs_rate
        profit = revenue - spend - cogs

        confidence = 0.7 if label == "Base Case" else (0.55 if label == "Best Case" else 0.45)
        rows.append(
            ScenarioRow(
                label=label,
                spend=round(spend, 2),
                revenue=round(revenue, 2),
                roas=round(roas, 3),
                profit=round(profit, 2),
                confidence=confidence,
            )
        )

    state.scenarios = rows
    return state
