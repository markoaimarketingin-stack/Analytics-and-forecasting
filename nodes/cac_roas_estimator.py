from __future__ import annotations
from typing import Dict
from analytics_agent.state import AnalyticsState


def safe_div(a: float, b: float) -> float:
    return float(a) / float(b) if b else 0.0


def cac_roas_estimator(state: AnalyticsState) -> AnalyticsState:
    # Expect channel_performance like {channel: {"spend": x, "conversions": y, "revenue": z}}
    totals = {"spend": 0.0, "conversions": 0.0, "revenue": 0.0}
    for ch, m in (state.channel_performance or {}).items():
        totals["spend"] += float(m.get("spend", 0))
        totals["conversions"] += float(m.get("conversions", 0))
        totals["revenue"] += float(m.get("revenue", 0))

    cac = safe_div(totals["spend"], max(totals["conversions"], 1))
    roas = safe_div(totals["revenue"], max(totals["spend"], 1))
    blended_roas = roas  # blended across channels already

    ltv = float(state.revenue_data.get("ltv", 0.0)) or safe_div(
        totals["revenue"], max(totals["conversions"], 1)
    )

    variable_cogs_rate = float(state.cost_structure.get("variable_cogs_rate", 0.0))
    contribution_margin = 1.0 - variable_cogs_rate - safe_div(cac, max(ltv, 1e-9))

    state.metrics.update(
        {
            "total_spend": totals["spend"],
            "total_conversions": totals["conversions"],
            "total_revenue": totals["revenue"],
            "cac": round(cac, 4),
            "roas": round(roas, 4),
            "blended_roas": round(blended_roas, 4),
            "ltv": round(ltv, 4),
            "ltv_cac_ratio": round(safe_div(ltv, cac if cac else 1e-9), 4),
            "contribution_margin": round(contribution_margin, 4),
        }
    )

    return state
