from __future__ import annotations
from typing import List
from analytics_agent.state import AnalyticsState, Suggestion


def _lack(state: AnalyticsState, key: str) -> bool:
    return not bool(getattr(state, key, None))


def suggestion_generator(state: AnalyticsState) -> AnalyticsState:
    suggestions: List[Suggestion] = []

    # Core examples adapted to analytics maturity
    if _lack(state, "historical_data"):
        suggestions.append(
            Suggestion(
                title="Create a custom performance dashboard",
                description="Build a real-time dashboard tracking KPIs across channels.",
                reasoning="Historical data is missing; a dashboard will establish baselines and trends.",
                actions={"execute": "create:dashboard", "ignore": "dismiss"},
            )
        )
    else:
        suggestions.append(
            Suggestion(
                title="Conduct a cohort analysis",
                description="Analyze cohort retention, LTV, and repeat purchases over time.",
                reasoning="Historical data is available; deeper retention insights can unlock LTV growth.",
                actions={"execute": "run:cohort_analysis", "ignore": "dismiss"},
            )
        )

    if not state.funnel_model or state.funnel_model.purchases == 0:
        suggestions.append(
            Suggestion(
                title="Set up conversion funnels in your analytics tool",
                description="Define and track funnel stages to identify drop-offs.",
                reasoning="Funnel conversions appear low or untracked; instrumentation can reveal leakage.",
                actions={"execute": "setup:funnel_tracking", "ignore": "dismiss"},
            )
        )

    suggestions.append(
        Suggestion(
            title="Analyze the impact of marketing on revenue",
            description="Connect marketing spend with revenue to determine true ROI.",
            reasoning="Attribution and ROAS insights will guide budget allocation for scale.",
            actions={"execute": "run:attribution_report", "ignore": "dismiss"},
        )
    )

    state.suggestions_list.extend(suggestions)
    return state
