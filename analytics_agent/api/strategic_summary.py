from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal

import pandas as pd

from analytics_agent.api.models import (
    StrategicActiveRates,
    StrategicAnalyticsDataQuality,
    StrategicAnalyticsDateRange,
    StrategicAnalyticsMetadata,
    StrategicAnalyticsPayload,
    StrategicCampaignSpendAndCacRow,
    StrategicConversionRateByFunnelStageRow,
    StrategicExpansionTriggerEventRow,
    StrategicFeatureAdoptionRow,
    StrategicKeyEventCompletionRateRow,
    StrategicLostReasonRow,
    StrategicLtvBySegmentRow,
    StrategicPipelineByChannelRow,
    StrategicPipelineByGeoRow,
    StrategicPipelineVolumeAndWinRate,
    StrategicPricingPlanMixRow,
    StrategicProductUsageAndActivationSignals,
    StrategicRevenueAndRetentionCohortRow,
    StrategicTrafficByChannelRow,
)
from analytics_agent.db import queries

StrategicGranularity = Literal["daily", "weekly", "monthly", "quarterly"]

CLIENT_RAW_DATA_ROOT = Path(__file__).resolve().parents[2] / "client_raw_data"
SUPPORTED_GRANULARITIES: set[str] = {"daily", "weekly", "monthly", "quarterly"}

RAW_FILE_MAP: dict[str, str] = {
    "company_profile": "company_profile.json",
    "manifest": "manifest.json",
    "contacts": "crm/contacts.csv",
    "deals": "crm/deals.csv",
    "sessions": "analytics/sessions.csv",
    "analytics_events": "analytics/events.csv",
    "ad_platform_exports": "marketing/ad_platform_exports.csv",
    "email_campaigns": "marketing/email_campaigns.csv",
    "orders": "sales/orders.csv",
    "refunds": "sales/refunds.csv",
    "payments": "finance/payments.csv",
    "invoices": "finance/invoices.csv",
    "product_feedback": "product/feedback.jsonl",
    "feature_requests": "product/feature_requests.jsonl",
}

SOURCE_SYSTEM_BY_FRAME: dict[str, str] = {
    "contacts": "crm",
    "deals": "crm",
    "sessions": "ga4",
    "analytics_events": "ga4",
    "ad_platform_exports": "ad_platform",
    "email_campaigns": "email_platform",
    "orders": "commerce",
    "refunds": "commerce",
    "payments": "billing",
    "invoices": "billing",
    "product_feedback": "product_feedback",
    "feature_requests": "product_feedback",
}

CHANNEL_ALIASES: dict[str, str] = {
    "google": "google_search",
    "google_ads": "google_search",
    "google ads": "google_search",
    "linkedin_ads": "linkedin_ads",
    "linkedin": "linkedin_ads",
    "meta": "paid_social",
    "meta_ads": "paid_social",
    "facebook": "paid_social",
    "facebook_ads": "paid_social",
    "instagram": "paid_social",
    "instagram_ads": "paid_social",
    "tiktok": "tiktok_ads",
    "tiktok_ads": "tiktok_ads",
    "email": "email",
    "email_reply": "email",
    "referral": "referral",
    "organic": "organic_search",
    "direct": "direct",
    "website_form": "website_form",
    "event": "events",
    "import": "imported",
}

RAW_FUNNEL_STAGE_ORDER = [
    "page_view",
    "view_item",
    "signup",
    "form_submit",
    "add_to_cart",
    "purchase",
]
NORMALIZED_FUNNEL_STAGE_ORDER = [
    "impression",
    "click",
    "landing_page_view",
    "add_to_cart",
    "purchase",
]
ACTIVATION_EVENT_PRIORITY = [
    "purchase",
    "activation",
    "activated",
    "first_value",
    "form_submit",
    "signup",
    "add_to_cart",
    "view_item",
]
QUALIFIED_PIPELINE_STAGES = {"qualified", "proposal", "negotiation", "won"}


@dataclass
class StrategicDataContext:
    raw_frames: dict[str, pd.DataFrame]
    normalized_frames: dict[str, pd.DataFrame]
    company_profile: dict[str, Any]
    manifest: dict[str, Any]


def build_strategic_summary_payload(
    *,
    company_id: str,
    date_from: str | None = None,
    date_to: str | None = None,
    granularity: StrategicGranularity = "daily",
    currency: str | None = None,
    timezone_name: str = "UTC",
    attribution_model: str = "first_touch",
) -> StrategicAnalyticsPayload:
    resolved_granularity = granularity if granularity in SUPPORTED_GRANULARITIES else "daily"
    context = _load_context(company_id)
    start_ts, end_ts = _resolve_date_bounds(context, date_from=date_from, date_to=date_to)

    traffic_by_channel = _build_traffic_by_channel(context, start_ts, end_ts, resolved_granularity)
    conversion_rates = _build_conversion_rates_by_funnel_stage(context, start_ts, end_ts, resolved_granularity)
    pipeline = _build_pipeline_volume_and_win_rate(context, start_ts, end_ts)
    cohorts = _build_revenue_and_retention_cohorts(context, start_ts, end_ts)
    campaign_spend = _build_campaign_spend_and_cac(context, start_ts, end_ts, resolved_granularity)
    pricing_plan_mix = _build_pricing_plan_mix(context, start_ts, end_ts)
    product_usage = _build_product_usage_and_activation_signals(context, start_ts, end_ts)

    source_systems = _infer_source_systems(context)
    inferred_currency = _infer_currency(context, explicit_currency=currency)
    data_quality = _build_data_quality(
        source_systems=source_systems,
        traffic_by_channel=traffic_by_channel,
        conversion_rates=conversion_rates,
        pipeline=pipeline,
        cohorts=cohorts,
        campaign_spend=campaign_spend,
        pricing_plan_mix=pricing_plan_mix,
        product_usage=product_usage,
    )

    metadata = StrategicAnalyticsMetadata(
        company_id=company_id,
        date_range=StrategicAnalyticsDateRange(
            from_=_to_date_string(start_ts),
            to=_to_date_string(end_ts),
        ),
        granularity=resolved_granularity,
        currency=inferred_currency,
        timezone=timezone_name or "UTC",
        attribution_model=attribution_model or "first_touch",
        source_systems=source_systems,
        last_updated_at=_infer_last_updated_at(context),
        data_quality=data_quality,
    )

    return StrategicAnalyticsPayload(
        analytics_metadata=metadata,
        traffic_by_channel=traffic_by_channel,
        conversion_rates_by_funnel_stage=conversion_rates,
        pipeline_volume_and_win_rate=pipeline if pipeline else {},
        revenue_and_retention_cohorts=cohorts,
        campaign_spend_and_cac=campaign_spend,
        pricing_plan_mix=pricing_plan_mix,
        product_usage_and_activation_signals=product_usage if product_usage else {},
    )


def _load_context(company_id: str) -> StrategicDataContext:
    raw_frames, company_profile, manifest = _load_raw_data(company_id)
    normalized_frames = _load_normalized_frames(company_id)
    return StrategicDataContext(
        raw_frames=raw_frames,
        normalized_frames=normalized_frames,
        company_profile=company_profile,
        manifest=manifest,
    )


def _load_raw_data(company_id: str) -> tuple[dict[str, pd.DataFrame], dict[str, Any], dict[str, Any]]:
    client_dir = CLIENT_RAW_DATA_ROOT / f"client_id={company_id}"
    frames: dict[str, pd.DataFrame] = {}

    for frame_name, relative_path in RAW_FILE_MAP.items():
        path = client_dir / relative_path
        if relative_path.endswith(".csv"):
            frames[frame_name] = _read_csv(path)
        elif relative_path.endswith(".jsonl"):
            frames[frame_name] = _read_jsonl(path)

    company_profile = _read_json(client_dir / RAW_FILE_MAP["company_profile"])
    manifest = _read_json(client_dir / RAW_FILE_MAP["manifest"])
    return frames, company_profile, manifest


def _load_normalized_frames(company_id: str) -> dict[str, pd.DataFrame]:
    frames: dict[str, pd.DataFrame] = {}
    for dataset_name in ("campaigns", "customers", "events", "retention", "transactions"):
        try:
            frame, _ = queries.get_dataset_dataframe_with_source(dataset_name, client_id=company_id)
        except Exception:
            frame = pd.DataFrame()
        frames[dataset_name] = frame if isinstance(frame, pd.DataFrame) else pd.DataFrame()
    return frames


def _read_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    try:
        return pd.read_csv(path)
    except Exception:
        return pd.DataFrame()


def _read_jsonl(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    try:
        return pd.read_json(path, lines=True)
    except Exception:
        return pd.DataFrame()


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _resolve_date_bounds(
    context: StrategicDataContext,
    *,
    date_from: str | None,
    date_to: str | None,
) -> tuple[pd.Timestamp, pd.Timestamp]:
    parsed_from = pd.to_datetime(date_from, errors="coerce") if date_from else pd.NaT
    parsed_to = pd.to_datetime(date_to, errors="coerce") if date_to else pd.NaT
    if not pd.isna(parsed_from) and not pd.isna(parsed_to):
        return parsed_from.normalize(), parsed_to.normalize()

    discovered_dates: list[pd.Timestamp] = []
    column_candidates = {
        "contacts": ["created_at", "last_activity_at"],
        "deals": ["created_at", "close_date"],
        "sessions": ["date"],
        "analytics_events": ["event_date", "timestamp"],
        "ad_platform_exports": ["date"],
        "email_campaigns": ["send_date"],
        "orders": ["created_at"],
        "refunds": ["refund_date"],
        "payments": ["payment_date"],
        "invoices": ["invoice_date", "due_date"],
        "feature_requests": ["created_at"],
        "product_feedback": ["created_at"],
        "campaigns": ["date"],
        "customers": ["signup_date"],
        "events": ["timestamp"],
        "transactions": ["purchase_date"],
    }

    for frame_name, columns in column_candidates.items():
        frame = context.raw_frames.get(frame_name) if frame_name in context.raw_frames else context.normalized_frames.get(frame_name)
        if frame is None or frame.empty:
            continue
        for column in columns:
            if column not in frame.columns:
                continue
            parsed = pd.to_datetime(frame[column], errors="coerce").dropna()
            if parsed.empty:
                continue
            discovered_dates.append(parsed.min())
            discovered_dates.append(parsed.max())

    if discovered_dates:
        inferred_start = min(discovered_dates).normalize()
        inferred_end = max(discovered_dates).normalize()
    else:
        now = pd.Timestamp.utcnow().normalize()
        inferred_start = now
        inferred_end = now

    return (
        parsed_from.normalize() if not pd.isna(parsed_from) else inferred_start,
        parsed_to.normalize() if not pd.isna(parsed_to) else inferred_end,
    )


def _build_traffic_by_channel(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
    granularity: StrategicGranularity,
) -> list[StrategicTrafficByChannelRow]:
    raw_rows = _build_traffic_by_channel_from_raw(context, start_ts, end_ts, granularity)
    if raw_rows:
        return raw_rows
    return _build_traffic_by_channel_from_normalized(context, start_ts, end_ts, granularity)


def _build_traffic_by_channel_from_raw(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
    granularity: StrategicGranularity,
) -> list[StrategicTrafficByChannelRow]:
    ad_df = _prepare_frame(context.raw_frames.get("ad_platform_exports"), "date", start_ts, end_ts, granularity)
    sessions_df = _prepare_frame(context.raw_frames.get("sessions"), "date", start_ts, end_ts, granularity)
    contacts_df = _prepare_frame(context.raw_frames.get("contacts"), "created_at", start_ts, end_ts, granularity)
    deals_df = _prepare_frame(context.raw_frames.get("deals"), "created_at", start_ts, end_ts, granularity)
    orders_df = _prepare_frame(context.raw_frames.get("orders"), "created_at", start_ts, end_ts, granularity)

    if all(frame.empty for frame in [ad_df, sessions_df, contacts_df, deals_df, orders_df]):
        return []

    records: dict[tuple[str, str, str], dict[str, Any]] = {}

    if not ad_df.empty:
        ad_df["channel"] = ad_df["channel"].map(_normalize_channel)
        for (channel, period_start, period_end), group in ad_df.groupby(["channel", "period_start", "period_end"], dropna=False):
            row = _get_or_create_channel_record(records, channel, period_start, period_end)
            row["impressions"] += _safe_numeric_sum(group, "impressions")
            row["clicks"] += _safe_numeric_sum(group, "clicks")
            row["spend"] += _safe_numeric_sum(group, "spend")

    if not sessions_df.empty:
        sessions_df["channel"] = sessions_df["source"].map(_normalize_channel)
        sessions_df["converted"] = _coerce_boolean_series(sessions_df.get("converted"))
        for (channel, period_start, period_end), group in sessions_df.groupby(["channel", "period_start", "period_end"], dropna=False):
            row = _get_or_create_channel_record(records, channel, period_start, period_end)
            row["sessions"] += int(group["session_id"].astype(str).nunique()) if "session_id" in group.columns else len(group.index)
            visitor_col = "user_id" if "user_id" in group.columns else "session_id"
            row["visitors"] += int(group[visitor_col].astype(str).nunique())
            row["leads"] += int(group[group["converted"]]["user_id"].astype(str).nunique()) if "user_id" in group.columns else int(group["converted"].sum())

    if not contacts_df.empty:
        contacts_df["channel"] = contacts_df["source"].map(_normalize_channel)
        contacts_df["lifecycle_stage"] = contacts_df["lifecycle_stage"].map(_normalize_token)
        for (channel, period_start, period_end), group in contacts_df.groupby(["channel", "period_start", "period_end"], dropna=False):
            row = _get_or_create_channel_record(records, channel, period_start, period_end)
            if "contact_id" not in group.columns:
                continue
            row["leads"] += int(group[group["lifecycle_stage"] == "lead"]["contact_id"].astype(str).nunique())
            row["mqls"] += int(group[group["lifecycle_stage"] == "mql"]["contact_id"].astype(str).nunique())
            row["sqls"] += int(group[group["lifecycle_stage"] == "sql"]["contact_id"].astype(str).nunique())

    if not deals_df.empty:
        deals_df["channel"] = deals_df["source"].map(_normalize_channel)
        deals_df["stage"] = deals_df["stage"].map(_normalize_token)
        for (channel, period_start, period_end), group in deals_df.groupby(["channel", "period_start", "period_end"], dropna=False):
            row = _get_or_create_channel_record(records, channel, period_start, period_end)
            if "deal_id" in group.columns:
                row["opportunities"] += int(group["deal_id"].astype(str).nunique())
                row["customers"] += int(group[group["stage"] == "won"]["deal_id"].astype(str).nunique())

    if not orders_df.empty:
        orders_df["channel"] = orders_df["channel"].map(_normalize_channel)
        paid_df = orders_df.copy()
        if "status" in paid_df.columns:
            paid_df["status"] = paid_df["status"].map(_normalize_token)
            paid_df = paid_df[paid_df["status"].isin({"paid", "settled", "won"})]
        for (channel, period_start, period_end), group in paid_df.groupby(["channel", "period_start", "period_end"], dropna=False):
            row = _get_or_create_channel_record(records, channel, period_start, period_end)
            if "customer_id" in group.columns:
                row["customers"] = max(row["customers"], int(group["customer_id"].astype(str).nunique()))

    return _finalize_traffic_rows(records)


def _build_traffic_by_channel_from_normalized(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
    granularity: StrategicGranularity,
) -> list[StrategicTrafficByChannelRow]:
    campaigns_df = _prepare_frame(context.normalized_frames.get("campaigns"), "date", start_ts, end_ts, granularity)
    events_df = _prepare_frame(context.normalized_frames.get("events"), "timestamp", start_ts, end_ts, granularity)
    transactions_df = _prepare_frame(context.normalized_frames.get("transactions"), "purchase_date", start_ts, end_ts, granularity)

    if all(frame.empty for frame in [campaigns_df, events_df, transactions_df]):
        return []

    records: dict[tuple[str, str, str], dict[str, Any]] = {}
    if not campaigns_df.empty:
        campaigns_df["channel"] = campaigns_df["channel"].map(_normalize_channel)
        for (channel, period_start, period_end), group in campaigns_df.groupby(["channel", "period_start", "period_end"], dropna=False):
            row = _get_or_create_channel_record(records, channel, period_start, period_end)
            row["impressions"] += _safe_numeric_sum(group, "impressions")
            row["clicks"] += _safe_numeric_sum(group, "clicks")
            row["spend"] += _safe_numeric_sum(group, "spend")
            row["customers"] += int(round(_safe_numeric_sum(group, "purchases")))

    if not events_df.empty:
        events_df["channel"] = events_df["channel"].map(_normalize_channel)
        events_df["event_type"] = events_df["event_type"].map(_normalize_token)
        visitor_col = "customer_id" if "customer_id" in events_df.columns else None
        for (channel, period_start, period_end), group in events_df.groupby(["channel", "period_start", "period_end"], dropna=False):
            row = _get_or_create_channel_record(records, channel, period_start, period_end)
            if "session_id" in group.columns:
                row["sessions"] += int(group["session_id"].astype(str).nunique())
            if visitor_col:
                row["visitors"] += int(group[visitor_col].astype(str).nunique())
                row["leads"] += int(group[group["event_type"].isin({"lead", "signup"})][visitor_col].astype(str).nunique())
                row["mqls"] += int(group[group["event_type"] == "mql"][visitor_col].astype(str).nunique())
                row["sqls"] += int(group[group["event_type"] == "sql"][visitor_col].astype(str).nunique())
                row["opportunities"] += int(group[group["event_type"] == "opportunity"][visitor_col].astype(str).nunique())

    if not transactions_df.empty and "customer_id" in transactions_df.columns:
        channel_by_customer = _channel_by_customer_from_normalized_events(events_df)
        transactions_df["channel"] = transactions_df["customer_id"].astype(str).map(channel_by_customer).fillna("unknown")
        for (channel, period_start, period_end), group in transactions_df.groupby(["channel", "period_start", "period_end"], dropna=False):
            row = _get_or_create_channel_record(records, channel, period_start, period_end)
            row["customers"] = max(row["customers"], int(group["customer_id"].astype(str).nunique()))

    return _finalize_traffic_rows(records)


def _build_conversion_rates_by_funnel_stage(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
    granularity: StrategicGranularity,
) -> list[StrategicConversionRateByFunnelStageRow]:
    raw_rows = _build_conversion_rates_from_raw_events(context, start_ts, end_ts, granularity)
    if raw_rows:
        return raw_rows
    return _build_conversion_rates_from_normalized_events(context, start_ts, end_ts, granularity)


def _build_conversion_rates_from_raw_events(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
    granularity: StrategicGranularity,
) -> list[StrategicConversionRateByFunnelStageRow]:
    events_df = _prepare_frame(context.raw_frames.get("analytics_events"), "timestamp", start_ts, end_ts, granularity)
    if events_df.empty or "user_id" not in events_df.columns or "event_type" not in events_df.columns:
        return []
    return _build_conversion_rows_from_event_frame(
        events_df=events_df,
        entity_col="user_id",
        channel_col="source",
        event_col="event_type",
        timestamp_col="timestamp",
        segment_map={},
        default_segment="all",
        granularity=granularity,
        preferred_stages=RAW_FUNNEL_STAGE_ORDER,
    )


def _build_conversion_rates_from_normalized_events(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
    granularity: StrategicGranularity,
) -> list[StrategicConversionRateByFunnelStageRow]:
    events_df = _prepare_frame(context.normalized_frames.get("events"), "timestamp", start_ts, end_ts, granularity)
    customers_df = context.normalized_frames.get("customers", pd.DataFrame())
    if events_df.empty or "customer_id" not in events_df.columns or "event_type" not in events_df.columns:
        return []

    segment_map: dict[str, str] = {}
    if not customers_df.empty and {"customer_id", "segment"}.issubset(customers_df.columns):
        customer_segment = customers_df[["customer_id", "segment"]].dropna().copy()
        segment_map = {
            str(row["customer_id"]): _normalize_token(row["segment"]) or "all"
            for _, row in customer_segment.iterrows()
        }

    return _build_conversion_rows_from_event_frame(
        events_df=events_df,
        entity_col="customer_id",
        channel_col="channel",
        event_col="event_type",
        timestamp_col="timestamp",
        segment_map=segment_map,
        default_segment="all",
        granularity=granularity,
        preferred_stages=NORMALIZED_FUNNEL_STAGE_ORDER,
    )


def _build_conversion_rows_from_event_frame(
    *,
    events_df: pd.DataFrame,
    entity_col: str,
    channel_col: str,
    event_col: str,
    timestamp_col: str,
    segment_map: dict[str, str],
    default_segment: str,
    granularity: StrategicGranularity,
    preferred_stages: list[str],
) -> list[StrategicConversionRateByFunnelStageRow]:
    df = events_df.copy()
    df[timestamp_col] = _parse_datetime_series(df[timestamp_col])
    df = df.dropna(subset=[timestamp_col, entity_col])
    if df.empty:
        return []

    df[event_col] = df[event_col].map(_normalize_token)
    df[channel_col] = df[channel_col].map(_normalize_channel)
    available_stages = [stage for stage in preferred_stages if stage in set(df[event_col].dropna())]
    if len(available_stages) < 2:
        return []

    aggregates: dict[tuple[str, str, str, str, str], dict[str, Any]] = {}
    sort_columns = [entity_col, timestamp_col]
    df = df.sort_values(sort_columns)

    for entity_id, entity_events in df.groupby(entity_col):
        entity_events = entity_events.sort_values(timestamp_col)
        first_occurrence: dict[str, tuple[pd.Timestamp, str]] = {}
        for _, row in entity_events.iterrows():
            stage = str(row.get(event_col) or "")
            if stage and stage not in first_occurrence:
                first_occurrence[stage] = (
                    pd.Timestamp(row[timestamp_col]),
                    _normalize_channel(row.get(channel_col)),
                )

        entity_segment = segment_map.get(str(entity_id), default_segment)
        for current_stage, next_stage in zip(available_stages, available_stages[1:]):
            if current_stage not in first_occurrence:
                continue
            current_time, current_channel = first_occurrence[current_stage]
            period_start, period_end = _period_bounds(current_time, granularity)
            key = (
                entity_segment or default_segment,
                current_channel or "unknown",
                f"{current_stage}_to_{next_stage}",
                _to_date_string(period_start),
                _to_date_string(period_end),
            )
            aggregate = aggregates.setdefault(
                key,
                {"entered_stage": 0, "moved_to_next_stage": 0, "durations": []},
            )
            aggregate["entered_stage"] += 1

            next_value = first_occurrence.get(next_stage)
            if next_value and next_value[0] >= current_time:
                aggregate["moved_to_next_stage"] += 1
                aggregate["durations"].append((next_value[0] - current_time).total_seconds() / 86400.0)

    rows: list[StrategicConversionRateByFunnelStageRow] = []
    for (segment, channel, stage_name, period_start, period_end), values in sorted(aggregates.items()):
        entered_stage = int(values["entered_stage"])
        moved = int(values["moved_to_next_stage"])
        durations = values["durations"]
        rows.append(
            StrategicConversionRateByFunnelStageRow(
                segment=segment or default_segment,
                channel=channel or "unknown",
                stage_name=stage_name,
                period_start=period_start,
                period_end=period_end,
                entered_stage=entered_stage,
                moved_to_next_stage=moved,
                conversion_rate=_round_float(_safe_divide(moved, entered_stage), 4),
                drop_off_rate=_round_float(1.0 - _safe_divide(moved, entered_stage), 4),
                median_days_to_convert=_round_float(float(pd.Series(durations).median()), 1) if durations else None,
            )
        )
    return rows


def _build_pipeline_volume_and_win_rate(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
) -> StrategicPipelineVolumeAndWinRate | dict[str, Any]:
    deals_df = _filter_frame_between(context.raw_frames.get("deals"), ["created_at"], start_ts, end_ts)
    contacts_df = context.raw_frames.get("contacts", pd.DataFrame())
    if deals_df.empty:
        return _build_pipeline_from_generic_frames(context, start_ts, end_ts)

    deals_df = deals_df.copy()
    deals_df["amount"] = _coerce_numeric_series(deals_df.get("amount"))
    deals_df["stage"] = deals_df["stage"].map(_normalize_token)
    deals_df["source"] = deals_df["source"].map(_normalize_channel)
    deals_df["created_at"] = _parse_datetime_series(deals_df["created_at"])
    if "close_date" in deals_df.columns:
        deals_df["close_date"] = _parse_datetime_series(deals_df["close_date"])

    merged = deals_df
    if not contacts_df.empty and {"contact_id", "country"}.issubset(contacts_df.columns):
        merged = merged.merge(
            contacts_df[["contact_id", "country"]].drop_duplicates(),
            on="contact_id",
            how="left",
        )

    won_df = merged[merged["stage"] == "won"].copy()
    opportunity_count = int(len(merged.index))
    won_deals = int(len(won_df.index))

    pipeline_by_channel = [
        StrategicPipelineByChannelRow(
            channel=channel or "unknown",
            pipeline_created=_round_float(float(group["amount"].sum()), 2),
            qualified_pipeline=_round_float(float(group[group["stage"].isin(QUALIFIED_PIPELINE_STAGES)]["amount"].sum()), 2),
            opportunity_count=int(len(group.index)),
            win_rate=_round_float(_safe_divide(len(group[group["stage"] == "won"].index), len(group.index)), 4),
        )
        for channel, group in merged.groupby("source", dropna=False)
    ]

    pipeline_by_geo: list[StrategicPipelineByGeoRow] = []
    if "country" in merged.columns:
        for geo, group in merged.groupby("country", dropna=False):
            pipeline_by_geo.append(
                StrategicPipelineByGeoRow(
                    geo=str(geo or "unknown"),
                    pipeline_created=_round_float(float(group["amount"].sum()), 2),
                    qualified_pipeline=_round_float(float(group[group["stage"].isin(QUALIFIED_PIPELINE_STAGES)]["amount"].sum()), 2),
                    opportunity_count=int(len(group.index)),
                    win_rate=_round_float(_safe_divide(len(group[group["stage"] == "won"].index), len(group.index)), 4),
                )
            )

    lost_reason_breakdown: list[StrategicLostReasonRow] = []
    if "lost_reason" in merged.columns:
        lost_df = merged[merged["stage"] == "lost"].copy()
        for reason, group in lost_df.groupby("lost_reason", dropna=False):
            lost_reason_breakdown.append(
                StrategicLostReasonRow(reason=_normalize_token(reason) or "unknown", count=int(len(group.index)))
            )

    sales_cycle_days = None
    if "close_date" in won_df.columns and "created_at" in won_df.columns and not won_df.empty:
        cycle_days = (won_df["close_date"] - won_df["created_at"]).dt.total_seconds() / 86400.0
        cycle_days = cycle_days.dropna()
        sales_cycle_days = _round_float(float(cycle_days.mean()), 1) if not cycle_days.empty else None

    return StrategicPipelineVolumeAndWinRate(
        period_start=_to_date_string(start_ts),
        period_end=_to_date_string(end_ts),
        pipeline_created=_round_float(float(merged["amount"].sum()), 2),
        qualified_pipeline=_round_float(float(merged[merged["stage"].isin(QUALIFIED_PIPELINE_STAGES)]["amount"].sum()), 2),
        opportunity_count=opportunity_count,
        won_deals=won_deals,
        average_deal_size=_round_float(float(won_df["amount"].mean() if not won_df.empty else merged["amount"].mean()), 2),
        win_rate=_round_float(_safe_divide(won_deals, opportunity_count), 4),
        sales_cycle_days=sales_cycle_days,
        pipeline_by_channel=sorted(pipeline_by_channel, key=lambda row: row.pipeline_created, reverse=True),
        pipeline_by_segment=[],
        pipeline_by_geo=sorted(pipeline_by_geo, key=lambda row: row.pipeline_created, reverse=True),
        lost_reason_breakdown=lost_reason_breakdown,
    )


def _build_pipeline_from_generic_frames(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
) -> StrategicPipelineVolumeAndWinRate | dict[str, Any]:
    for frame in [context.normalized_frames.get("campaigns"), context.normalized_frames.get("transactions")]:
        if frame is None or frame.empty:
            continue
        if not {"pipeline_created", "qualified_pipeline", "opportunity_count", "won_deals"}.issubset(set(frame.columns)):
            continue
        filtered = _filter_frame_between(frame, ["date", "purchase_date", "created_at"], start_ts, end_ts)
        if filtered.empty:
            continue
        filtered["pipeline_created"] = _coerce_numeric_series(filtered.get("pipeline_created"))
        filtered["qualified_pipeline"] = _coerce_numeric_series(filtered.get("qualified_pipeline"))
        filtered["opportunity_count"] = _coerce_numeric_series(filtered.get("opportunity_count"))
        filtered["won_deals"] = _coerce_numeric_series(filtered.get("won_deals"))
        opportunity_count = int(filtered["opportunity_count"].sum())
        won_deals = int(filtered["won_deals"].sum())
        avg_deal_size = None
        if "average_deal_size" in filtered.columns:
            avg_deal_size = float(_coerce_numeric_series(filtered.get("average_deal_size")).mean())
        return StrategicPipelineVolumeAndWinRate(
            period_start=_to_date_string(start_ts),
            period_end=_to_date_string(end_ts),
            pipeline_created=_round_float(float(filtered["pipeline_created"].sum()), 2),
            qualified_pipeline=_round_float(float(filtered["qualified_pipeline"].sum()), 2),
            opportunity_count=opportunity_count,
            won_deals=won_deals,
            average_deal_size=_round_float(avg_deal_size or 0.0, 2),
            win_rate=_round_float(_safe_divide(won_deals, opportunity_count), 4),
            sales_cycle_days=_round_float(float(_coerce_numeric_series(filtered.get("sales_cycle_days")).mean()), 1)
            if "sales_cycle_days" in filtered.columns
            else None,
            pipeline_by_channel=[],
            pipeline_by_segment=[],
            pipeline_by_geo=[],
            lost_reason_breakdown=[],
        )
    return {}


def _build_revenue_and_retention_cohorts(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
) -> list[StrategicRevenueAndRetentionCohortRow]:
    normalized_rows = _build_cohorts_from_normalized(context, start_ts, end_ts)
    if normalized_rows:
        return normalized_rows
    return _build_cohorts_from_orders(context, start_ts, end_ts)


def _build_cohorts_from_normalized(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
) -> list[StrategicRevenueAndRetentionCohortRow]:
    customers_df = context.normalized_frames.get("customers", pd.DataFrame())
    retention_df = context.normalized_frames.get("retention", pd.DataFrame())
    transactions_df = context.normalized_frames.get("transactions", pd.DataFrame())
    if customers_df.empty or "signup_date" not in customers_df.columns or "customer_id" not in customers_df.columns:
        return []

    customers_df = customers_df.copy()
    customers_df["signup_date"] = _parse_datetime_series(customers_df["signup_date"])
    customers_df = customers_df[(customers_df["signup_date"] >= start_ts) & (customers_df["signup_date"] <= end_ts)]
    if customers_df.empty:
        return []

    retention_df = retention_df.copy()
    if not retention_df.empty and "customer_id" in retention_df.columns:
        retention_df["tenure_months"] = _coerce_numeric_series(retention_df.get("tenure_months"))
        retention_df["churned"] = _coerce_boolean_series(retention_df.get("churned"))

    transactions_df = transactions_df.copy()
    if not transactions_df.empty and "customer_id" in transactions_df.columns:
        transactions_df["revenue"] = _coerce_numeric_series(transactions_df.get("revenue"))
        if "is_repeat_purchase" in transactions_df.columns:
            transactions_df["is_repeat_purchase"] = _coerce_boolean_series(transactions_df.get("is_repeat_purchase"))
        else:
            transactions_df["is_repeat_purchase"] = False

    customers_df["cohort_month"] = customers_df["signup_date"].dt.to_period("M").astype(str)
    rows: list[StrategicRevenueAndRetentionCohortRow] = []
    for cohort_month, cohort_customers in customers_df.groupby("cohort_month"):
        customer_ids = cohort_customers["customer_id"].astype(str)
        customers_start = int(customer_ids.nunique())

        scoped_retention = retention_df[retention_df["customer_id"].astype(str).isin(set(customer_ids))].copy() if not retention_df.empty else pd.DataFrame()
        scoped_transactions = transactions_df[transactions_df["customer_id"].astype(str).isin(set(customer_ids))].copy() if not transactions_df.empty else pd.DataFrame()

        retained_30d = _retained_count(scoped_retention, minimum_months=1)
        retained_60d = _retained_count(scoped_retention, minimum_months=2)
        retained_90d = _retained_count(scoped_retention, minimum_months=3)
        cohort_revenue = float(scoped_transactions["revenue"].sum()) if not scoped_transactions.empty else 0.0
        repeat_revenue = float(scoped_transactions[scoped_transactions["is_repeat_purchase"]]["revenue"].sum()) if not scoped_transactions.empty else 0.0
        repeat_purchase_rate = None
        if not scoped_transactions.empty and "customer_id" in scoped_transactions.columns:
            repeat_flags = scoped_transactions.groupby("customer_id")["is_repeat_purchase"].max()
            repeat_purchase_rate = _round_float(float(repeat_flags.mean()), 4)

        ltv_by_segment: list[StrategicLtvBySegmentRow] = []
        if "segment" in cohort_customers.columns and not scoped_transactions.empty:
            segment_df = cohort_customers[["customer_id", "segment"]].copy()
            merged = scoped_transactions.merge(segment_df, on="customer_id", how="left")
            for segment, segment_group in merged.groupby("segment", dropna=False):
                active_customers = int(segment_group["customer_id"].astype(str).nunique())
                ltv_by_segment.append(
                    StrategicLtvBySegmentRow(
                        segment=_normalize_token(segment) or "unknown",
                        ltv=_round_float(_safe_divide(float(segment_group["revenue"].sum()), active_customers), 2)
                        if active_customers
                        else None,
                    )
                )

        rows.append(
            StrategicRevenueAndRetentionCohortRow(
                cohort_month=cohort_month,
                customers_start=customers_start,
                customers_retained_30d=retained_30d,
                customers_retained_60d=retained_60d,
                customers_retained_90d=retained_90d,
                gross_revenue_retention=None,
                net_revenue_retention=None,
                expansion_revenue=_round_float(repeat_revenue, 2),
                contraction_revenue=None,
                churned_revenue=None,
                repeat_purchase_rate=repeat_purchase_rate,
                ltv=_round_float(_safe_divide(cohort_revenue, customers_start), 2) if customers_start else None,
                ltv_by_segment=sorted(ltv_by_segment, key=lambda item: item.segment),
            )
        )
    return rows


def _build_cohorts_from_orders(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
) -> list[StrategicRevenueAndRetentionCohortRow]:
    orders_df = context.raw_frames.get("orders", pd.DataFrame())
    if orders_df.empty or not {"customer_id", "created_at", "amount"}.issubset(set(orders_df.columns)):
        return []

    orders_df = orders_df.copy()
    orders_df["created_at"] = _parse_datetime_series(orders_df["created_at"])
    orders_df["amount"] = _coerce_numeric_series(orders_df.get("amount"))
    orders_df = orders_df.dropna(subset=["created_at"])
    if orders_df.empty:
        return []

    first_order = orders_df.sort_values("created_at").groupby("customer_id", as_index=False).first()[["customer_id", "created_at"]]
    first_order = first_order.rename(columns={"created_at": "first_order_at"})
    first_order = first_order[(first_order["first_order_at"] >= start_ts) & (first_order["first_order_at"] <= end_ts)]
    if first_order.empty:
        return []

    rows: list[StrategicRevenueAndRetentionCohortRow] = []
    for cohort_month, cohort_group in first_order.assign(cohort_month=first_order["first_order_at"].dt.to_period("M").astype(str)).groupby("cohort_month"):
        customer_ids = set(cohort_group["customer_id"].astype(str))
        scoped_orders = orders_df[orders_df["customer_id"].astype(str).isin(customer_ids)].copy()
        retained_30d, retained_60d, retained_90d = _order_retention_counts(scoped_orders, cohort_group)
        repeat_purchase_flags = scoped_orders.groupby("customer_id").size() > 1
        rows.append(
            StrategicRevenueAndRetentionCohortRow(
                cohort_month=cohort_month,
                customers_start=int(len(customer_ids)),
                customers_retained_30d=retained_30d,
                customers_retained_60d=retained_60d,
                customers_retained_90d=retained_90d,
                gross_revenue_retention=None,
                net_revenue_retention=None,
                expansion_revenue=_round_float(float(scoped_orders.groupby("customer_id").apply(lambda group: group.sort_values("created_at").iloc[1:]["amount"].sum()).sum()), 2),
                contraction_revenue=None,
                churned_revenue=None,
                repeat_purchase_rate=_round_float(float(repeat_purchase_flags.mean()), 4) if not repeat_purchase_flags.empty else None,
                ltv=_round_float(_safe_divide(float(scoped_orders["amount"].sum()), len(customer_ids)), 2),
                ltv_by_segment=[],
            )
        )
    return rows


def _build_campaign_spend_and_cac(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
    granularity: StrategicGranularity,
) -> list[StrategicCampaignSpendAndCacRow]:
    raw_rows = _build_campaign_spend_and_cac_from_raw(context, start_ts, end_ts, granularity)
    if raw_rows:
        return raw_rows
    return _build_campaign_spend_and_cac_from_normalized(context, start_ts, end_ts, granularity)


def _build_campaign_spend_and_cac_from_raw(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
    granularity: StrategicGranularity,
) -> list[StrategicCampaignSpendAndCacRow]:
    campaigns_df = _prepare_frame(context.raw_frames.get("ad_platform_exports"), "date", start_ts, end_ts, granularity)
    orders_df = _prepare_frame(context.raw_frames.get("orders"), "created_at", start_ts, end_ts, granularity)
    contacts_df = _prepare_frame(context.raw_frames.get("contacts"), "created_at", start_ts, end_ts, granularity)
    deals_df = _prepare_frame(context.raw_frames.get("deals"), "created_at", start_ts, end_ts, granularity)
    if campaigns_df.empty:
        return []

    campaigns_df["channel"] = campaigns_df["channel"].map(_normalize_channel)
    campaigns_df["campaign_name"] = campaigns_df["campaign_name"].fillna("unknown_campaign").astype(str)
    campaigns_df["spend"] = _coerce_numeric_series(campaigns_df.get("spend"))
    campaigns_df["clicks"] = _coerce_numeric_series(campaigns_df.get("clicks"))
    campaigns_df["conversions"] = _coerce_numeric_series(campaigns_df.get("conversions"))

    channel_period_orders = {}
    if not orders_df.empty and "channel" in orders_df.columns:
        orders_df["channel"] = orders_df["channel"].map(_normalize_channel)
        orders_df["amount"] = _coerce_numeric_series(orders_df.get("amount"))
        channel_period_orders = {
            (channel, period_start, period_end): {
                "customers": int(group["customer_id"].astype(str).nunique()) if "customer_id" in group.columns else 0,
                "revenue": float(group["amount"].sum()),
            }
            for (channel, period_start, period_end), group in orders_df.groupby(["channel", "period_start", "period_end"], dropna=False)
        }

    channel_period_contacts = {}
    if not contacts_df.empty and {"source", "contact_id"}.issubset(contacts_df.columns):
        contacts_df["channel"] = contacts_df["source"].map(_normalize_channel)
        contacts_df["lifecycle_stage"] = contacts_df["lifecycle_stage"].map(_normalize_token)
        channel_period_contacts = {
            (channel, period_start, period_end): {
                "mqls": int(group[group["lifecycle_stage"] == "mql"]["contact_id"].astype(str).nunique()),
                "sqls": int(group[group["lifecycle_stage"] == "sql"]["contact_id"].astype(str).nunique()),
            }
            for (channel, period_start, period_end), group in contacts_df.groupby(["channel", "period_start", "period_end"], dropna=False)
        }

    channel_period_deals = {}
    if not deals_df.empty and {"source", "deal_id"}.issubset(deals_df.columns):
        deals_df["channel"] = deals_df["source"].map(_normalize_channel)
        channel_period_deals = {
            (channel, period_start, period_end): {
                "opportunities": int(group["deal_id"].astype(str).nunique()),
            }
            for (channel, period_start, period_end), group in deals_df.groupby(["channel", "period_start", "period_end"], dropna=False)
        }

    rows: list[StrategicCampaignSpendAndCacRow] = []
    for (channel, campaign_name, period_start, period_end), group in campaigns_df.groupby(
        ["channel", "campaign_name", "period_start", "period_end"],
        dropna=False,
    ):
        spend = float(group["spend"].sum())
        clicks = float(group["clicks"].sum())
        leads = float(group["conversions"].sum())
        channel_period_key = (channel, period_start, period_end)
        channel_group = campaigns_df[
            (campaigns_df["channel"] == channel)
            & (campaigns_df["period_start"] == period_start)
            & (campaigns_df["period_end"] == period_end)
        ]
        share_numerator = float(group["clicks"].sum()) if clicks > 0 else spend
        share_denominator = float(channel_group["clicks"].sum()) if float(channel_group["clicks"].sum()) > 0 else float(channel_group["spend"].sum())
        share = _safe_divide(share_numerator, share_denominator)
        order_stats = channel_period_orders.get(channel_period_key, {})
        contact_stats = channel_period_contacts.get(channel_period_key, {})
        deal_stats = channel_period_deals.get(channel_period_key, {})
        attributed_customers = _round_float(order_stats.get("customers", 0) * share, 2) if order_stats else None
        attributed_revenue = order_stats.get("revenue", 0.0) * share if order_stats else 0.0
        attributed_mqls = float(contact_stats.get("mqls", 0) * share) if contact_stats else None
        attributed_sqls = float(contact_stats.get("sqls", 0) * share) if contact_stats else None
        attributed_opportunities = float(deal_stats.get("opportunities", 0) * share) if deal_stats else None

        rows.append(
            StrategicCampaignSpendAndCacRow(
                channel=channel or "unknown",
                campaign_name=str(campaign_name),
                period_start=period_start,
                period_end=period_end,
                spend=_round_float(spend, 2),
                attributed_leads=_round_float(leads, 2) if leads else None,
                attributed_mqls=_round_float(attributed_mqls, 2) if attributed_mqls is not None else None,
                attributed_sqls=_round_float(attributed_sqls, 2) if attributed_sqls is not None else None,
                attributed_opportunities=_round_float(attributed_opportunities, 2) if attributed_opportunities is not None else None,
                attributed_customers=_round_float(attributed_customers, 2) if attributed_customers is not None else None,
                cost_per_lead=_round_float(_safe_divide(spend, leads), 2) if leads else None,
                cost_per_mql=_round_float(_safe_divide(spend, attributed_mqls), 2) if attributed_mqls else None,
                cost_per_sql=_round_float(_safe_divide(spend, attributed_sqls), 2) if attributed_sqls else None,
                cost_per_opportunity=_round_float(_safe_divide(spend, attributed_opportunities), 2) if attributed_opportunities else None,
                cac=_round_float(_safe_divide(spend, attributed_customers), 2) if attributed_customers else None,
                roas=_round_float(_safe_divide(attributed_revenue, spend), 2) if spend else None,
                payback_period_months=None,
            )
        )
    return rows


def _build_campaign_spend_and_cac_from_normalized(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
    granularity: StrategicGranularity,
) -> list[StrategicCampaignSpendAndCacRow]:
    campaigns_df = _prepare_frame(context.normalized_frames.get("campaigns"), "date", start_ts, end_ts, granularity)
    if campaigns_df.empty:
        return []

    campaigns_df["channel"] = campaigns_df["channel"].map(_normalize_channel)
    campaigns_df["campaign_name"] = campaigns_df.get("campaign_name", campaigns_df.get("campaign_id", "unknown_campaign")).fillna("unknown_campaign").astype(str)
    campaigns_df["spend"] = _coerce_numeric_series(campaigns_df.get("spend"))
    campaigns_df["purchases"] = _coerce_numeric_series(campaigns_df.get("purchases"))
    campaigns_df["revenue"] = _coerce_numeric_series(campaigns_df.get("revenue"))
    campaigns_df["clicks"] = _coerce_numeric_series(campaigns_df.get("clicks"))
    rows: list[StrategicCampaignSpendAndCacRow] = []
    for (channel, campaign_name, period_start, period_end), group in campaigns_df.groupby(["channel", "campaign_name", "period_start", "period_end"], dropna=False):
        spend = float(group["spend"].sum())
        customers = float(group["purchases"].sum()) if "purchases" in group.columns else None
        revenue = float(group["revenue"].sum()) if "revenue" in group.columns else 0.0
        leads = float(group["clicks"].sum()) if "clicks" in group.columns else None
        rows.append(
            StrategicCampaignSpendAndCacRow(
                channel=channel or "unknown",
                campaign_name=str(campaign_name),
                period_start=period_start,
                period_end=period_end,
                spend=_round_float(spend, 2),
                attributed_leads=_round_float(leads, 2) if leads else None,
                attributed_mqls=None,
                attributed_sqls=None,
                attributed_opportunities=None,
                attributed_customers=_round_float(customers, 2) if customers is not None else None,
                cost_per_lead=_round_float(_safe_divide(spend, leads), 2) if leads else None,
                cost_per_mql=None,
                cost_per_sql=None,
                cost_per_opportunity=None,
                cac=_round_float(_safe_divide(spend, customers), 2) if customers else None,
                roas=_round_float(_safe_divide(revenue, spend), 2) if spend else None,
                payback_period_months=None,
            )
        )
    return rows


def _build_pricing_plan_mix(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
) -> list[StrategicPricingPlanMixRow]:
    orders_df = _filter_frame_between(context.raw_frames.get("orders"), ["created_at"], start_ts, end_ts)
    all_orders_df = context.raw_frames.get("orders", pd.DataFrame())
    if orders_df.empty or "product" not in orders_df.columns or "customer_id" not in orders_df.columns:
        return _build_pricing_plan_mix_from_generic_frames(context, start_ts, end_ts)

    orders_df = orders_df.copy()
    orders_df["amount"] = _coerce_numeric_series(orders_df.get("amount"))
    orders_df["discount_pct"] = _coerce_numeric_series(orders_df.get("discount_pct"))
    all_orders_df = all_orders_df.copy()
    all_orders_df["created_at"] = _parse_datetime_series(all_orders_df["created_at"])
    first_orders = (
        all_orders_df.sort_values("created_at")
        .groupby("customer_id", as_index=False)
        .first()[["customer_id", "created_at", "product"]]
        .rename(columns={"created_at": "first_order_at", "product": "first_product"})
    )

    total_revenue = float(orders_df["amount"].sum())
    rows: list[StrategicPricingPlanMixRow] = []
    for plan_name, group in orders_df.groupby("product", dropna=False):
        active_customers = int(group["customer_id"].astype(str).nunique())
        merged_first_orders = group.merge(first_orders, on="customer_id", how="left")
        new_customers = int(
            merged_first_orders[
                (merged_first_orders["first_order_at"] >= start_ts)
                & (merged_first_orders["first_order_at"] <= end_ts)
                & (merged_first_orders["first_product"].astype(str) == str(plan_name))
            ]["customer_id"].astype(str).nunique()
        )
        plan_revenue = float(group["amount"].sum())
        rows.append(
            StrategicPricingPlanMixRow(
                plan_name=_normalize_token(plan_name) or "unknown_plan",
                period_start=_to_date_string(start_ts),
                period_end=_to_date_string(end_ts),
                new_customers=new_customers,
                active_customers=active_customers,
                plan_revenue=_round_float(plan_revenue, 2),
                arpu=_round_float(_safe_divide(plan_revenue, active_customers), 2) if active_customers else None,
                trial_to_paid_rate=None,
                upgrade_rate=None,
                downgrade_rate=None,
                churn_rate=None,
                discount_rate=_round_float(float(group["discount_pct"].mean()) / 100.0, 4) if "discount_pct" in group.columns else None,
                plan_share_percent=_round_float(_safe_divide(plan_revenue, total_revenue), 4) if total_revenue else None,
            )
        )
    return sorted(rows, key=lambda row: row.plan_revenue, reverse=True)

def _build_product_usage_and_activation_signals(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
) -> StrategicProductUsageAndActivationSignals | dict[str, Any]:
    normalized_object = _build_product_usage_from_normalized(context, start_ts, end_ts)
    if normalized_object:
        return normalized_object
    return _build_product_usage_from_raw(context, start_ts, end_ts)


def _build_product_usage_from_normalized(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
) -> StrategicProductUsageAndActivationSignals | dict[str, Any]:
    customers_df = context.normalized_frames.get("customers", pd.DataFrame())
    events_df = context.normalized_frames.get("events", pd.DataFrame())
    retention_df = context.normalized_frames.get("retention", pd.DataFrame())
    if customers_df.empty or events_df.empty or not {"customer_id", "signup_date"}.issubset(set(customers_df.columns)):
        return {}

    customers_df = customers_df.copy()
    customers_df["signup_date"] = _parse_datetime_series(customers_df["signup_date"])
    customers_df = customers_df[(customers_df["signup_date"] >= start_ts) & (customers_df["signup_date"] <= end_ts)]
    if customers_df.empty:
        return {}

    events_df = events_df.copy()
    events_df["timestamp"] = _parse_datetime_series(events_df["timestamp"])
    events_df["event_type"] = events_df["event_type"].map(_normalize_token)
    events_df = events_df.dropna(subset=["timestamp", "customer_id"])
    events_df = events_df[events_df["customer_id"].astype(str).isin(set(customers_df["customer_id"].astype(str)))]
    if events_df.empty:
        return {}

    return _build_product_usage_object(
        signup_entities=customers_df.rename(columns={"signup_date": "signup_at"})[["customer_id", "signup_at"]],
        events_df=events_df.rename(columns={"customer_id": "entity_id"}),
        entity_id_col="entity_id",
        timestamp_col="timestamp",
        event_col="event_type",
        retention_df=retention_df,
        start_ts=start_ts,
        end_ts=end_ts,
    )


def _build_product_usage_from_raw(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
) -> StrategicProductUsageAndActivationSignals | dict[str, Any]:
    raw_events = _filter_frame_between(context.raw_frames.get("analytics_events"), ["timestamp", "event_date"], start_ts, end_ts)
    if raw_events.empty or "user_id" not in raw_events.columns:
        return {}

    raw_events = raw_events.copy()
    raw_events["timestamp"] = _parse_datetime_series(raw_events["timestamp"])
    raw_events["event_type"] = raw_events["event_type"].map(_normalize_token)
    signup_events = raw_events[raw_events["event_type"] == "signup"].sort_values("timestamp")
    if signup_events.empty:
        signup_entities = raw_events.sort_values("timestamp").groupby("user_id", as_index=False).first()[["user_id", "timestamp"]]
    else:
        signup_entities = signup_events.groupby("user_id", as_index=False).first()[["user_id", "timestamp"]]
    signup_entities = signup_entities.rename(columns={"user_id": "entity_id", "timestamp": "signup_at"})
    if signup_entities.empty:
        return {}

    return _build_product_usage_object(
        signup_entities=signup_entities,
        events_df=raw_events.rename(columns={"user_id": "entity_id"}),
        entity_id_col="entity_id",
        timestamp_col="timestamp",
        event_col="event_type",
        retention_df=pd.DataFrame(),
        start_ts=start_ts,
        end_ts=end_ts,
    )


def _build_product_usage_object(
    *,
    signup_entities: pd.DataFrame,
    events_df: pd.DataFrame,
    entity_id_col: str,
    timestamp_col: str,
    event_col: str,
    retention_df: pd.DataFrame,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
) -> StrategicProductUsageAndActivationSignals | dict[str, Any]:
    if signup_entities.empty or events_df.empty:
        return {}

    signup_entities = signup_entities.copy()
    signup_entities["signup_at"] = _parse_datetime_series(signup_entities["signup_at"])
    signup_entities = signup_entities.dropna(subset=["signup_at"])
    if signup_entities.empty:
        return {}

    events_df = events_df.copy()
    events_df[timestamp_col] = _parse_datetime_series(events_df[timestamp_col])
    events_df = events_df.dropna(subset=[timestamp_col, entity_id_col])
    events_df[event_col] = events_df[event_col].map(_normalize_token)
    merged = events_df.merge(signup_entities, on=entity_id_col, how="inner")
    merged = merged[merged[timestamp_col] >= merged["signup_at"]]
    if merged.empty:
        return {}

    activation_events = [event for event in ACTIVATION_EVENT_PRIORITY if event in set(merged[event_col])]
    if activation_events:
        activated = (
            merged[merged[event_col].isin(activation_events)]
            .sort_values(timestamp_col)
            .groupby(entity_id_col, as_index=False)
            .first()[[entity_id_col, timestamp_col]]
            .rename(columns={timestamp_col: "first_value_at"})
        )
    else:
        activated = pd.DataFrame(columns=[entity_id_col, "first_value_at"])

    signup_count = int(signup_entities[entity_id_col].astype(str).nunique())
    activated_users = int(activated[entity_id_col].astype(str).nunique()) if not activated.empty else 0

    median_time = None
    if not activated.empty:
        latency = activated.merge(signup_entities, on=entity_id_col, how="left")
        latency_hours = (latency["first_value_at"] - latency["signup_at"]).dt.total_seconds() / 3600.0
        latency_hours = latency_hours.dropna()
        median_time = _round_float(float(latency_hours.median()), 1) if not latency_hours.empty else None

    key_event_completion_rates: list[StrategicKeyEventCompletionRateRow] = []
    event_user_counts = merged.groupby(event_col)[entity_id_col].nunique().sort_values(ascending=False)
    for event_name, count in event_user_counts.head(5).items():
        key_event_completion_rates.append(
            StrategicKeyEventCompletionRateRow(
                event=str(event_name),
                completion_rate=_round_float(_safe_divide(int(count), signup_count), 4),
            )
        )

    activity_counts = merged.groupby(entity_id_col).size()
    power_user_threshold = float(activity_counts.quantile(0.75)) if not activity_counts.empty else math.inf
    power_users = set(activity_counts[activity_counts >= max(3, power_user_threshold)].index.astype(str))
    all_users = set(signup_entities[entity_id_col].astype(str))
    inactive_users = set(all_users) - set(merged[entity_id_col].astype(str))

    feature_adoption: list[StrategicFeatureAdoptionRow] = []
    core_events = {"page_view", "scroll"}
    for event_name, count in event_user_counts.items():
        if event_name in core_events:
            continue
        feature_adoption.append(
            StrategicFeatureAdoptionRow(
                feature=str(event_name),
                adoption_rate=_round_float(_safe_divide(int(count), signup_count), 4),
            )
        )
        if len(feature_adoption) >= 5:
            break

    expansion_trigger_events: list[StrategicExpansionTriggerEventRow] = []
    if power_users:
        power_user_df = merged[merged[entity_id_col].astype(str).isin(power_users)]
        for event_name, count in power_user_df.groupby(event_col)[entity_id_col].nunique().sort_values(ascending=False).head(3).items():
            expansion_trigger_events.append(
                StrategicExpansionTriggerEventRow(event=str(event_name), accounts=int(count))
            )

    usage_days = max(1, (end_ts.normalize() - start_ts.normalize()).days + 1)
    usage_weeks = max(1.0, usage_days / 7.0)

    active_rates = StrategicActiveRates(
        day_1=_round_float(_activity_window_rate(merged, signup_entities, entity_id_col, timestamp_col, days=1), 4),
        day_7=_round_float(_activity_window_rate(merged, signup_entities, entity_id_col, timestamp_col, days=7), 4),
        day_30=_round_float(_activity_window_rate(merged, signup_entities, entity_id_col, timestamp_col, days=30), 4),
    )

    inactive_user_rate = _safe_divide(len(inactive_users), signup_count)
    if not retention_df.empty and "customer_id" in retention_df.columns and "churned" in retention_df.columns:
        retention_df = retention_df.copy()
        retention_df["churned"] = _coerce_boolean_series(retention_df.get("churned"))
        matching = retention_df[retention_df["customer_id"].astype(str).isin(all_users)]
        if not matching.empty:
            inactive_user_rate = max(inactive_user_rate, float(matching["churned"].mean()))

    return StrategicProductUsageAndActivationSignals(
        period_start=_to_date_string(start_ts),
        period_end=_to_date_string(end_ts),
        signup_count=signup_count,
        activated_users=activated_users,
        activation_rate=_round_float(_safe_divide(activated_users, signup_count), 4),
        median_time_to_first_value_hours=median_time,
        key_event_completion_rates=key_event_completion_rates,
        active_rates=active_rates,
        feature_adoption_by_feature=feature_adoption,
        seat_utilization=_round_float(_safe_divide(len(set(merged[entity_id_col].astype(str))), signup_count), 4),
        usage_frequency_per_week=_round_float(_safe_divide(float(len(merged.index)), max(1, len(set(merged[entity_id_col].astype(str))))) / usage_weeks, 2),
        power_user_rate=_round_float(_safe_divide(len(power_users), signup_count), 4),
        inactive_user_rate=_round_float(inactive_user_rate, 4),
        expansion_trigger_events=expansion_trigger_events,
    )


def _build_data_quality(
    *,
    source_systems: list[str],
    traffic_by_channel: list[StrategicTrafficByChannelRow],
    conversion_rates: list[StrategicConversionRateByFunnelStageRow],
    pipeline: StrategicPipelineVolumeAndWinRate | dict[str, Any],
    cohorts: list[StrategicRevenueAndRetentionCohortRow],
    campaign_spend: list[StrategicCampaignSpendAndCacRow],
    pricing_plan_mix: list[StrategicPricingPlanMixRow],
    product_usage: StrategicProductUsageAndActivationSignals | dict[str, Any],
) -> StrategicAnalyticsDataQuality:
    section_presence = [
        bool(traffic_by_channel),
        bool(conversion_rates),
        bool(pipeline),
        bool(cohorts),
        bool(campaign_spend),
        bool(pricing_plan_mix),
        bool(product_usage),
    ]
    score = _round_float(sum(1 for present in section_presence if present) / len(section_presence), 2)
    notes: list[str] = []
    if not source_systems:
        notes.append("No upstream source systems were detected for this company.")
    if not traffic_by_channel:
        notes.append("Traffic-by-channel metrics are empty because ad, session, or campaign datasets were unavailable.")
    if not pipeline:
        notes.append("Pipeline metrics are empty because CRM deal data or equivalent pipeline fields were unavailable.")
    if not pricing_plan_mix:
        notes.append("Pricing plan mix is empty because no plan or product-level billing data was available.")
    if not product_usage:
        notes.append("Product activation signals are empty because signup and event timelines could not be joined.")
    return StrategicAnalyticsDataQuality(score=score, notes=notes)


def _infer_source_systems(context: StrategicDataContext) -> list[str]:
    systems = {
        source_system
        for frame_name, source_system in SOURCE_SYSTEM_BY_FRAME.items()
        if not context.raw_frames.get(frame_name, pd.DataFrame()).empty
    }
    if not systems:
        for frame_name, frame in context.normalized_frames.items():
            if frame is not None and not frame.empty:
                systems.add(_normalize_token(frame_name))
    return sorted(system for system in systems if system)


def _infer_currency(context: StrategicDataContext, explicit_currency: str | None) -> str:
    if explicit_currency and explicit_currency.strip():
        return explicit_currency.strip().upper()

    for candidate in (
        context.company_profile.get("currency"),
        context.manifest.get("currency"),
    ):
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip().upper()

    for frame_name, column_name in [
        ("orders", "currency"),
        ("payments", "currency"),
        ("invoices", "currency"),
        ("deals", "currency"),
    ]:
        frame = context.raw_frames.get(frame_name, pd.DataFrame())
        if frame.empty or column_name not in frame.columns:
            continue
        values = [str(value).strip().upper() for value in frame[column_name].dropna().tolist() if str(value).strip()]
        if values:
            return values[0]
    return "USD"


def _infer_last_updated_at(context: StrategicDataContext) -> str:
    timestamps: list[pd.Timestamp] = []
    for frame, columns in [
        (context.raw_frames.get("contacts"), ["last_activity_at", "created_at"]),
        (context.raw_frames.get("deals"), ["close_date", "created_at"]),
        (context.raw_frames.get("sessions"), ["date"]),
        (context.raw_frames.get("analytics_events"), ["timestamp", "event_date"]),
        (context.raw_frames.get("ad_platform_exports"), ["date"]),
        (context.raw_frames.get("orders"), ["created_at"]),
        (context.raw_frames.get("payments"), ["payment_date"]),
        (context.normalized_frames.get("campaigns"), ["date"]),
        (context.normalized_frames.get("events"), ["timestamp"]),
        (context.normalized_frames.get("transactions"), ["purchase_date"]),
    ]:
        if frame is None or frame.empty:
            continue
        for column in columns:
            if column not in frame.columns:
                continue
            parsed = _parse_datetime_series(frame[column]).dropna()
            if not parsed.empty:
                timestamps.append(parsed.max())
    last_ts = max(timestamps) if timestamps else pd.Timestamp.now("UTC")
    return _to_datetime_string(last_ts)


def _prepare_frame(
    frame: pd.DataFrame | None,
    date_column: str,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
    granularity: StrategicGranularity,
) -> pd.DataFrame:
    filtered = _filter_frame_between(frame, [date_column], start_ts, end_ts)
    if filtered.empty:
        return pd.DataFrame()
    filtered = filtered.copy()
    filtered[date_column] = _parse_datetime_series(filtered[date_column])
    filtered = filtered.dropna(subset=[date_column])
    if filtered.empty:
        return pd.DataFrame()
    period_bounds = filtered[date_column].apply(lambda value: _period_bounds(value, granularity))
    filtered["period_start"] = [ _to_date_string(start) for start, _ in period_bounds ]
    filtered["period_end"] = [ _to_date_string(end) for _, end in period_bounds ]
    return filtered


def _filter_frame_between(
    frame: pd.DataFrame | None,
    columns: list[str],
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
) -> pd.DataFrame:
    if frame is None or frame.empty:
        return pd.DataFrame()
    for column in columns:
        if column not in frame.columns:
            continue
        filtered = frame.copy()
        filtered[column] = _parse_datetime_series(filtered[column])
        filtered = filtered.dropna(subset=[column])
        filtered = filtered[(filtered[column] >= start_ts) & (filtered[column] <= end_ts + pd.Timedelta(days=1) - pd.Timedelta(microseconds=1))]
        if not filtered.empty:
            return filtered
    return pd.DataFrame()


def _period_bounds(value: pd.Timestamp, granularity: StrategicGranularity) -> tuple[pd.Timestamp, pd.Timestamp]:
    timestamp = pd.Timestamp(value).normalize()
    if granularity == "weekly":
        start = timestamp - pd.Timedelta(days=timestamp.dayofweek)
        end = start + pd.Timedelta(days=6)
        return start, end
    if granularity == "monthly":
        period = timestamp.to_period("M")
        return period.start_time.normalize(), period.end_time.normalize()
    if granularity == "quarterly":
        period = timestamp.to_period("Q")
        return period.start_time.normalize(), period.end_time.normalize()
    return timestamp, timestamp


def _get_or_create_channel_record(
    records: dict[tuple[str, str, str], dict[str, Any]],
    channel: str,
    period_start: str,
    period_end: str,
) -> dict[str, Any]:
    key = (channel or "unknown", period_start, period_end)
    return records.setdefault(
        key,
        {
            "channel": channel or "unknown",
            "period_start": period_start,
            "period_end": period_end,
            "impressions": 0.0,
            "clicks": 0.0,
            "sessions": 0.0,
            "visitors": 0.0,
            "leads": 0.0,
            "mqls": 0.0,
            "sqls": 0.0,
            "opportunities": 0.0,
            "customers": 0.0,
            "spend": 0.0,
        },
    )


def _finalize_traffic_rows(records: dict[tuple[str, str, str], dict[str, Any]]) -> list[StrategicTrafficByChannelRow]:
    rows: list[StrategicTrafficByChannelRow] = []
    for values in sorted(records.values(), key=lambda row: (row["period_start"], row["channel"])):
        impressions = float(values["impressions"])
        clicks = float(values["clicks"])
        sessions = float(values["sessions"])
        visitors = float(values["visitors"])
        leads = float(values["leads"])
        mqls = float(values["mqls"])
        sqls = float(values["sqls"])
        opportunities = float(values["opportunities"])
        customers = float(values["customers"])
        spend = float(values["spend"])
        rows.append(
            StrategicTrafficByChannelRow(
                channel=values["channel"],
                period_start=values["period_start"],
                period_end=values["period_end"],
                impressions=_round_float(impressions, 2),
                clicks=_round_float(clicks, 2),
                sessions=_round_float(sessions, 2),
                visitors=_round_float(visitors, 2),
                leads=_round_float(leads, 2),
                mqls=_round_float(mqls, 2),
                sqls=_round_float(sqls, 2),
                opportunities=_round_float(opportunities, 2),
                customers=_round_float(customers, 2),
                ctr=_round_float(_safe_divide(clicks, impressions), 4),
                cpc=_round_float(_safe_divide(spend, clicks), 2),
                cpm=_round_float(_safe_divide(spend, impressions / 1000.0), 2),
                visit_to_lead_rate=_round_float(_safe_divide(leads, sessions or visitors), 4),
                lead_to_mql_rate=_round_float(_safe_divide(mqls, leads), 4),
                mql_to_sql_rate=_round_float(_safe_divide(sqls, mqls), 4),
                sql_to_opportunity_rate=_round_float(_safe_divide(opportunities, sqls), 4),
                opportunity_to_customer_rate=_round_float(_safe_divide(customers, opportunities), 4),
            )
        )
    return rows


def _channel_by_customer_from_normalized_events(events_df: pd.DataFrame) -> dict[str, str]:
    if events_df.empty or not {"customer_id", "channel", "timestamp"}.issubset(set(events_df.columns)):
        return {}
    df = events_df.copy()
    df["timestamp"] = _parse_datetime_series(df["timestamp"])
    df = df.dropna(subset=["timestamp"])
    df["channel"] = df["channel"].map(_normalize_channel)
    df = df.sort_values(["customer_id", "timestamp"])
    first_touch = df.groupby("customer_id", as_index=False).first()
    return {str(row["customer_id"]): str(row["channel"] or "unknown") for _, row in first_touch.iterrows()}


def _build_pricing_plan_mix_from_generic_frames(
    context: StrategicDataContext,
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
) -> list[StrategicPricingPlanMixRow]:
    for frame in [context.normalized_frames.get("transactions"), context.normalized_frames.get("customers")]:
        if frame is None or frame.empty:
            continue
        plan_column = next((column for column in ("plan_name", "plan", "product", "pricing_plan") if column in frame.columns), None)
        if not plan_column:
            continue
        filtered = _filter_frame_between(frame, ["purchase_date", "signup_date", "date"], start_ts, end_ts)
        if filtered.empty:
            continue
        revenue_col = next((column for column in ("revenue", "amount", "mrr") if column in filtered.columns), None)
        if revenue_col:
            filtered[revenue_col] = _coerce_numeric_series(filtered.get(revenue_col))
        entity_col = "customer_id" if "customer_id" in filtered.columns else None
        total_revenue = float(filtered[revenue_col].sum()) if revenue_col else 0.0
        rows: list[StrategicPricingPlanMixRow] = []
        for plan_name, group in filtered.groupby(plan_column, dropna=False):
            active_customers = int(group[entity_col].astype(str).nunique()) if entity_col else int(len(group.index))
            plan_revenue = float(group[revenue_col].sum()) if revenue_col else 0.0
            rows.append(
                StrategicPricingPlanMixRow(
                    plan_name=_normalize_token(plan_name) or "unknown_plan",
                    period_start=_to_date_string(start_ts),
                    period_end=_to_date_string(end_ts),
                    new_customers=active_customers,
                    active_customers=active_customers,
                    plan_revenue=_round_float(plan_revenue, 2),
                    arpu=_round_float(_safe_divide(plan_revenue, active_customers), 2) if active_customers else None,
                    trial_to_paid_rate=None,
                    upgrade_rate=None,
                    downgrade_rate=None,
                    churn_rate=None,
                    discount_rate=None,
                    plan_share_percent=_round_float(_safe_divide(plan_revenue, total_revenue), 4) if total_revenue else None,
                )
            )
        return rows
    return []


def _retained_count(retention_df: pd.DataFrame, *, minimum_months: int) -> int:
    if retention_df.empty or not {"tenure_months", "customer_id"}.issubset(set(retention_df.columns)):
        return 0
    retained = retention_df[retention_df["tenure_months"] >= minimum_months].copy()
    if "churned" in retained.columns:
        retained = retained[~retained["churned"]]
    return int(retained["customer_id"].astype(str).nunique())


def _order_retention_counts(scoped_orders: pd.DataFrame, cohort_group: pd.DataFrame) -> tuple[int, int, int]:
    retained_counts = []
    first_order_map = {
        str(row["customer_id"]): pd.Timestamp(row["first_order_at"])
        for _, row in cohort_group.iterrows()
    }
    for threshold_days in (30, 60, 90):
        retained = 0
        for customer_id, group in scoped_orders.groupby("customer_id"):
            first_order_at = first_order_map.get(str(customer_id))
            if first_order_at is None:
                continue
            follow_up = group[group["created_at"] >= first_order_at + pd.Timedelta(days=threshold_days)]
            if not follow_up.empty:
                retained += 1
        retained_counts.append(retained)
    return tuple(retained_counts)


def _activity_window_rate(
    merged: pd.DataFrame,
    signup_entities: pd.DataFrame,
    entity_id_col: str,
    timestamp_col: str,
    *,
    days: int,
) -> float:
    if signup_entities.empty:
        return 0.0
    within_window = merged[merged[timestamp_col] <= merged["signup_at"] + pd.Timedelta(days=days)]
    active_entities = int(within_window[entity_id_col].astype(str).nunique()) if not within_window.empty else 0
    total_entities = int(signup_entities[entity_id_col].astype(str).nunique())
    return _safe_divide(active_entities, total_entities)


def _safe_numeric_sum(frame: pd.DataFrame, column: str) -> float:
    if column not in frame.columns:
        return 0.0
    return float(_coerce_numeric_series(frame[column]).sum())


def _coerce_numeric_series(series: Any) -> pd.Series:
    if series is None:
        return pd.Series(dtype=float)
    return pd.to_numeric(series, errors="coerce").fillna(0.0)


def _coerce_boolean_series(series: Any) -> pd.Series:
    if series is None:
        return pd.Series(dtype=bool)
    normalized = pd.Series(series).fillna(False).astype(str).str.strip().str.lower()
    return normalized.isin({"1", "true", "yes", "y", "paid", "settled"})


def _parse_datetime_series(series: Any) -> pd.Series:
    if series is None:
        return pd.Series(dtype="datetime64[ns]")
    parsed = pd.to_datetime(series, errors="coerce", utc=True)
    return parsed.dt.tz_localize(None)


def _safe_divide(numerator: float | int, denominator: float | int) -> float:
    if denominator in (0, 0.0, None):
        return 0.0
    try:
        return float(numerator) / float(denominator)
    except Exception:
        return 0.0


def _round_float(value: float | int | None, digits: int) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), digits)
    except Exception:
        return None


def _normalize_token(value: Any) -> str:
    if value is None:
        return ""
    normalized = re.sub(r"[^a-zA-Z0-9]+", "_", str(value).strip().lower())
    return normalized.strip("_")


def _normalize_channel(value: Any) -> str:
    token = _normalize_token(value)
    return CHANNEL_ALIASES.get(token, token or "unknown")


def _to_date_string(value: pd.Timestamp | datetime) -> str:
    timestamp = pd.Timestamp(value)
    return timestamp.date().isoformat()


def _to_datetime_string(value: pd.Timestamp | datetime) -> str:
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize(timezone.utc)
    else:
        timestamp = timestamp.tz_convert(timezone.utc)
    return timestamp.isoformat().replace("+00:00", "Z")
