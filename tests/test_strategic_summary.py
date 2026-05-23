from __future__ import annotations

import pandas as pd

from analytics_agent.api import strategic_summary
from analytics_agent.db import queries


def _empty_dataset_loader(*args, **kwargs):
    return pd.DataFrame(), "empty"


def test_strategic_summary_uses_local_raw_data_and_preserves_contract(monkeypatch):
    monkeypatch.setattr(queries, "get_dataset_dataframe_with_source", _empty_dataset_loader)

    payload = strategic_summary.build_strategic_summary_payload(
        company_id="cli_0025",
        date_from="2026-01-01",
        date_to="2026-05-12",
        granularity="daily",
        timezone_name="Asia/Calcutta",
        attribution_model="first_touch",
    )

    data = payload.model_dump(by_alias=True)
    assert set(data.keys()) == {
        "analytics_metadata",
        "traffic_by_channel",
        "conversion_rates_by_funnel_stage",
        "pipeline_volume_and_win_rate",
        "revenue_and_retention_cohorts",
        "campaign_spend_and_cac",
        "pricing_plan_mix",
        "product_usage_and_activation_signals",
    }

    assert data["analytics_metadata"]["company_id"] == "cli_0025"
    assert data["analytics_metadata"]["date_range"]["from"] == "2026-01-01"
    assert data["analytics_metadata"]["date_range"]["to"] == "2026-05-12"
    assert data["analytics_metadata"]["timezone"] == "Asia/Calcutta"
    assert "ga4" in data["analytics_metadata"]["source_systems"]
    assert data["traffic_by_channel"]
    assert data["conversion_rates_by_funnel_stage"]
    assert data["pipeline_volume_and_win_rate"]
    assert data["campaign_spend_and_cac"]
    assert data["pricing_plan_mix"]
    assert data["product_usage_and_activation_signals"]


def test_strategic_summary_returns_empty_sections_when_no_data_exists(monkeypatch, tmp_path):
    monkeypatch.setattr(strategic_summary, "CLIENT_RAW_DATA_ROOT", tmp_path)
    monkeypatch.setattr(queries, "get_dataset_dataframe_with_source", _empty_dataset_loader)

    payload = strategic_summary.build_strategic_summary_payload(
        company_id="missing_company",
        date_from="2026-01-01",
        date_to="2026-05-12",
    )

    data = payload.model_dump(by_alias=True)
    assert data["traffic_by_channel"] == []
    assert data["conversion_rates_by_funnel_stage"] == []
    assert data["pipeline_volume_and_win_rate"] == {}
    assert data["revenue_and_retention_cohorts"] == []
    assert data["campaign_spend_and_cac"] == []
    assert data["pricing_plan_mix"] == []
    assert data["product_usage_and_activation_signals"] == {}
    assert data["analytics_metadata"]["company_id"] == "missing_company"
