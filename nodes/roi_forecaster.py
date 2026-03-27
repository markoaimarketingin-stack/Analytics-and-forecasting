from __future__ import annotations
from typing import List, Dict
import math
from analytics_agent.state import AnalyticsState, ForecastResults


def _month_growth(g: float, m: int) -> float:
    return math.pow(1 + g, m)


def roi_forecaster(state: AnalyticsState) -> AnalyticsState:
    metrics = state.metrics
    spend = float(metrics.get("total_spend", 0.0))
    base_roas = float(metrics.get("roas", 0.0))

    ctx = state.structured_context or {}
    horizon = int(ctx.get("forecast_months") or ctx.get("horizon_months") or 3)
    growth_rate = float(ctx.get("projected_growth_rate", 0.0))
    seasonality: List[float] = ctx.get("seasonality_multipliers") or [1.0] * horizon

    monthly: List[Dict[str, float]] = []
    cum_profit = 0.0
    breakeven_month = None

    for i in range(horizon):
        growth_mult = _month_growth(growth_rate, i)
        seas = seasonality[i] if i < len(seasonality) else 1.0
        month_spend = spend * seas
        month_revenue = month_spend * base_roas * growth_mult
        variable_cogs_rate = float(state.cost_structure.get("variable_cogs_rate", 0.0))
        cogs = month_revenue * variable_cogs_rate
        profit = month_revenue - month_spend - cogs
        cum_profit += profit

        if breakeven_month is None and cum_profit >= 0:
            breakeven_month = i + 1

        monthly.append(
            {
                "month": float(i + 1),
                "spend": round(month_spend, 2),
                "revenue": round(month_revenue, 2),
                "roas": round((month_revenue / month_spend) if month_spend else 0.0, 3),
                "profit": round(profit, 2),
                "cum_profit": round(cum_profit, 2),
            }
        )

    totals = {
        "spend": round(sum(m["spend"] for m in monthly), 2),
        "revenue": round(sum(m["revenue"] for m in monthly), 2),
        "profit": round(sum(m["profit"] for m in monthly), 2),
    }

    assumptions = [
        f"Assuming base ROAS of {round(base_roas,3)} from historical averages",
        f"Assuming projected monthly growth rate of {round(growth_rate*100,2)}%",
        f"Assuming variable COGS rate of {float(state.cost_structure.get('variable_cogs_rate', 0.0))*100:.1f}%",
    ]
    if "aov" in state.revenue_data:
        assumptions.append(f"Assuming AOV of {state.revenue_data['aov']}")
    if "conversion_rate" in state.conversion_rates:
        assumptions.append(f"Assuming {state.conversion_rates['conversion_rate']*100:.2f}% conversion rate")
    if "repeat_purchase_rate" in state.structured_context:
        rpr = float(state.structured_context.get("repeat_purchase_rate", 0.0))
        assumptions.append(f"Assuming {rpr*100:.1f}% repeat purchase")

    state.forecast_results = ForecastResults(
        monthly=monthly, totals=totals, breakeven_month=breakeven_month, assumptions=assumptions
    )

    return state
