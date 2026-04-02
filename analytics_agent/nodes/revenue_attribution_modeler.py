from __future__ import annotations
from typing import Dict
from analytics_agent.state import AnalyticsState, AttributionModel


def revenue_attribution_modeler(state: AnalyticsState) -> AnalyticsState:
    channels = state.channel_performance or {}

    last_click: Dict[str, float] = {}
    multi_touch: Dict[str, float] = {}

    total_revenue = 0.0
    total_spend = 0.0
    ch_count = len(channels) or 1

    for ch, m in channels.items():
        rev = float(m.get("revenue", 0.0))
        sp = float(m.get("spend", 0.0))
        total_revenue += rev
        total_spend += sp
        last_click[ch] = rev  # naive last-click equal to channel revenue reported

    # Simplified multi-touch: equal split of total revenue across channels with any touch
    per = (total_revenue / ch_count) if ch_count else 0.0
    for ch in channels.keys():
        multi_touch[ch] = per

    blended: Dict[str, float] = {}
    for ch in channels.keys():
        blended[ch] = (last_click.get(ch, 0.0) + multi_touch.get(ch, 0.0)) / 2.0

    state.attribution_model = AttributionModel(
        last_click=last_click,
        multi_touch=multi_touch,
        blended=blended,
    )

    return state
