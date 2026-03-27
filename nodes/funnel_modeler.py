from __future__ import annotations
from analytics_agent.state import AnalyticsState, FunnelModel


def funnel_modeler(state: AnalyticsState) -> AnalyticsState:
    cr = state.conversion_rates or {}
    impressions = int(cr.get("impressions", 0) or state.structured_context.get("impressions", 0) or 0)
    ctr = float(cr.get("ctr", 0.015))
    lp_rate = float(cr.get("lp_view_rate", 0.5))
    atc_rate = float(cr.get("add_to_cart_rate", 0.1))
    cvr = float(cr.get("conversion_rate", 0.03))

    clicks = int(impressions * ctr)
    lp_views = int(clicks * lp_rate)
    add_to_cart = int(lp_views * atc_rate)
    purchases = int(add_to_cart * cvr)

    def drop(a: int, b: int) -> float:
        return 1 - (b / a) if a else 0.0

    dropoffs = {
        "impr_to_click": round(drop(impressions, clicks), 3),
        "click_to_lp": round(drop(clicks, lp_views), 3),
        "lp_to_atc": round(drop(lp_views, add_to_cart), 3),
        "atc_to_purchase": round(drop(add_to_cart, purchases), 3),
    }

    state.funnel_model = FunnelModel(
        impressions=impressions,
        clicks=clicks,
        lp_views=lp_views,
        add_to_cart=add_to_cart,
        purchases=purchases,
        dropoffs=dropoffs,
    )

    # Highlight biggest leakage point via warnings
    biggest = max(dropoffs.items(), key=lambda x: x[1]) if dropoffs else ("none", 0)
    state.warnings.append(f"Biggest funnel leakage: {biggest[0]} at {biggest[1]*100:.1f}%")

    return state
