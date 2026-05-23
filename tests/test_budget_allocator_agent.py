from __future__ import annotations

import pandas as pd

from analytics_agent.agents.budget_allocator_agent import BudgetAllocatorAgent


def test_budget_allocator_normalizes_channel_aliases_and_drops_unknowns():
    agent = BudgetAllocatorAgent()
    frame = pd.DataFrame(
        [
            {"channel": "Google Ads", "spend": 1000, "revenue": 3000, "purchases": 30},
            {"channel": "google_ads", "spend": 500, "revenue": 1800, "purchases": 18},
            {"channel": "LinkedIn", "spend": 400, "revenue": 900, "purchases": 6},
            {"channel": "", "spend": 9999, "revenue": 9999, "purchases": 999},
            {"channel": "unknown", "spend": 8888, "revenue": 8888, "purchases": 888},
        ]
    )

    normalized, diagnostics = agent._normalize_channels(frame)

    assert diagnostics["dropped_rows"] == 2
    assert sorted(diagnostics["available_channels"]) == ["google_search", "linkedin_ads"]

    baseline = agent._baseline_by_channel(normalized)
    assert set(baseline.keys()) == {"google_search", "linkedin_ads"}
    assert baseline["google_search"]["spend"] == 1500.0
    assert baseline["linkedin_ads"]["spend"] == 400.0
