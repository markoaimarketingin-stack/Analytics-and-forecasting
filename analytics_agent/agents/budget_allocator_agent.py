from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd

from analytics_agent.db import queries
from analytics_agent.state import AnalyticsState, BudgetAllocationAnalysis


@dataclass
class BudgetAllocatorRequest:
    total_budget: float = 0.0
    objective: str = "profit"
    risk_tolerance: str = "balanced"
    max_shift_pct: float = 20.0
    min_channel_pct: float = 5.0
    max_channel_pct: float = 60.0
    channel: str = "all"
    campaign_type: str = "all"
    campaign_id: str = "all"


class BudgetAllocatorAgent:
    """Creates channel-level budget plans under constraints and risk profile."""

    def analyze(
        self,
        state: AnalyticsState,
        request: BudgetAllocatorRequest | None = None,
    ) -> AnalyticsState:
        request = request or self._build_request(state)
        client_id = str((state.user_request or {}).get("client_id") or "").strip() or None

        campaigns_df, source = queries.get_dataset_dataframe_with_source(
            "campaigns",
            prefer_remote=not client_id,
            client_id=client_id,
        )
        if campaigns_df.empty:
            state.budget_allocation_analysis = BudgetAllocationAnalysis(
                objective=request.objective,
                risk_tolerance=request.risk_tolerance,
                assumptions=["No campaigns data available; allocation plan unavailable."],
                diagnostics={"source": source, "reason": "missing_campaigns"},
                data_source=source,
            )
            return state

        filtered = self._apply_filters(campaigns_df, request)
        if filtered.empty:
            state.budget_allocation_analysis = BudgetAllocationAnalysis(
                objective=request.objective,
                risk_tolerance=request.risk_tolerance,
                assumptions=["No campaign rows matched selected filters."],
                diagnostics={"source": source, "reason": "no_rows_for_filters"},
                data_source=source,
            )
            return state

        baseline_by_channel = self._baseline_by_channel(filtered)
        if not baseline_by_channel:
            state.budget_allocation_analysis = BudgetAllocationAnalysis(
                objective=request.objective,
                risk_tolerance=request.risk_tolerance,
                assumptions=["No channel spend data was available for allocation."],
                diagnostics={"source": source, "reason": "no_channel_spend"},
                data_source=source,
            )
            return state

        baseline_total = sum(item["spend"] for item in baseline_by_channel.values())
        total_budget = request.total_budget if request.total_budget > 0 else baseline_total
        total_budget = max(total_budget, 1.0)

        score_by_channel = self._score_channels(
            filtered,
            objective=request.objective,
            risk_tolerance=request.risk_tolerance,
        )

        plans = {
            "conservative": self._allocate_with_profile(
                baseline_by_channel,
                score_by_channel,
                total_budget,
                request,
                profile="conservative",
            ),
            "balanced": self._allocate_with_profile(
                baseline_by_channel,
                score_by_channel,
                total_budget,
                request,
                profile="balanced",
            ),
            "aggressive": self._allocate_with_profile(
                baseline_by_channel,
                score_by_channel,
                total_budget,
                request,
                profile="aggressive",
            ),
        }

        selected_plan = plans.get(request.risk_tolerance.lower(), plans["balanced"])

        assumptions = [
            f"Objective: {request.objective}",
            f"Risk profile: {request.risk_tolerance}",
            f"Max shift cap per channel: {request.max_shift_pct:.1f}%",
            f"Channel min/max bounds: {request.min_channel_pct:.1f}% / {request.max_channel_pct:.1f}%",
        ]

        state.budget_allocation_analysis = BudgetAllocationAnalysis(
            objective=request.objective,
            risk_tolerance=request.risk_tolerance,
            total_budget=round(total_budget, 2),
            baseline_budget=round(baseline_total, 2),
            expected_kpi_delta=round(selected_plan["expected_kpi_delta"], 3),
            expected_roi_delta=round(selected_plan["expected_roi_delta"], 3),
            confidence_band=selected_plan["confidence_band"],
            channel_allocations=selected_plan["channel_allocations"],
            plans=plans,
            constraint_log=selected_plan["constraint_log"],
            assumptions=assumptions,
            diagnostics={
                "campaign_rows": int(len(filtered.index)),
                "channels": len(baseline_by_channel),
                "source": source,
                "filters": {
                    "channel": request.channel,
                    "campaign_type": request.campaign_type,
                    "campaign_id": request.campaign_id,
                },
            },
            data_source=source,
        )
        return state

    def _build_request(self, state: AnalyticsState) -> BudgetAllocatorRequest:
        req = state.user_request or {}
        return BudgetAllocatorRequest(
            total_budget=float(req.get("total_budget", 0.0) or 0.0),
            objective=str(req.get("objective", "profit") or "profit").lower(),
            risk_tolerance=str(req.get("risk_tolerance", "balanced") or "balanced").lower(),
            max_shift_pct=float(req.get("max_shift_pct", 20.0) or 20.0),
            min_channel_pct=float(req.get("min_channel_pct", 5.0) or 5.0),
            max_channel_pct=float(req.get("max_channel_pct", 60.0) or 60.0),
            channel=str(req.get("channel", "all") or "all"),
            campaign_type=str(req.get("campaign_type", "all") or "all"),
            campaign_id=str(req.get("campaign_id", "all") or "all"),
        )

    def _apply_filters(self, df: pd.DataFrame, request: BudgetAllocatorRequest) -> pd.DataFrame:
        out = df.copy()

        if request.channel.lower() != "all" and "channel" in out.columns:
            target = str(request.channel).strip().casefold()
            series = out["channel"].astype(str).str.strip().str.casefold()
            out = out[series == target]

        if request.campaign_type.lower() != "all" and "campaign_type" in out.columns:
            target = str(request.campaign_type).strip().casefold()
            series = out["campaign_type"].astype(str).str.strip().str.casefold()
            out = out[series == target]

        if request.campaign_id.lower() != "all" and "campaign_id" in out.columns:
            target = str(request.campaign_id).strip().casefold()
            series = out["campaign_id"].astype(str).str.strip().str.casefold()
            out = out[series == target]

        return out

    def _baseline_by_channel(self, df: pd.DataFrame) -> dict[str, dict[str, float]]:
        if "channel" not in df.columns or "spend" not in df.columns:
            return {}

        grouped = df.groupby("channel", as_index=False)[[c for c in ["spend", "revenue", "purchases"] if c in df.columns]].sum()
        out: dict[str, dict[str, float]] = {}
        for _, row in grouped.iterrows():
            channel = str(row.get("channel", "Unknown"))
            spend = float(row.get("spend", 0.0) or 0.0)
            revenue = float(row.get("revenue", 0.0) or 0.0)
            purchases = float(row.get("purchases", 0.0) or 0.0)
            roi = (revenue - spend) / spend if spend > 0 else 0.0
            out[channel] = {
                "spend": spend,
                "revenue": revenue,
                "purchases": purchases,
                "roi": roi,
            }
        return out

    def _score_channels(
        self,
        df: pd.DataFrame,
        objective: str,
        risk_tolerance: str,
    ) -> dict[str, float]:
        grouped = df.groupby("channel", as_index=False)[[c for c in ["spend", "revenue", "purchases"] if c in df.columns]].sum()

        if "roi" in df.columns:
            roi_std = df.groupby("channel")["roi"].std().fillna(0.0).to_dict()
        else:
            roi_std = {}

        risk_penalty_weight = {
            "conservative": 1.6,
            "balanced": 1.0,
            "aggressive": 0.5,
        }.get(risk_tolerance.lower(), 1.0)

        scores: dict[str, float] = {}
        for _, row in grouped.iterrows():
            channel = str(row.get("channel", "Unknown"))
            spend = float(row.get("spend", 0.0) or 0.0)
            revenue = float(row.get("revenue", 0.0) or 0.0)
            purchases = float(row.get("purchases", 0.0) or 0.0)
            roi = (revenue - spend) / spend if spend > 0 else 0.0
            roas = revenue / spend if spend > 0 else 0.0
            conv_eff = purchases / spend if spend > 0 else 0.0

            if objective == "revenue":
                base_score = roas
            elif objective == "roas":
                base_score = roas
            elif objective == "new_customers":
                base_score = conv_eff
            else:
                base_score = roi

            risk_penalty = float(roi_std.get(channel, 0.0) or 0.0) * risk_penalty_weight
            score = max(0.0001, base_score - risk_penalty)
            scores[channel] = float(score)

        return scores

    def _allocate_with_profile(
        self,
        baseline_by_channel: dict[str, dict[str, float]],
        score_by_channel: dict[str, float],
        total_budget: float,
        request: BudgetAllocatorRequest,
        profile: str,
    ) -> dict[str, Any]:
        profile_factor = {
            "conservative": 0.65,
            "balanced": 1.0,
            "aggressive": 1.35,
        }.get(profile, 1.0)

        channels = list(baseline_by_channel.keys())
        if not channels:
            return {
                "channel_allocations": [],
                "expected_kpi_delta": 0.0,
                "expected_roi_delta": 0.0,
                "confidence_band": {"low": 0.0, "base": 0.0, "high": 0.0},
                "constraint_log": ["No eligible channels available for allocation."],
            }

        raw_scores = {ch: max(0.0001, score_by_channel.get(ch, 0.0001) * profile_factor) for ch in channels}
        score_sum = sum(raw_scores.values())
        if score_sum <= 0:
            score_sum = 1.0

        min_pct = max(0.0, min(100.0, request.min_channel_pct)) / 100.0
        max_pct = max(min_pct, min(100.0, request.max_channel_pct)) / 100.0
        max_shift = max(0.0, min(100.0, request.max_shift_pct)) / 100.0

        baseline_total = max(1.0, sum(baseline_by_channel[ch]["spend"] for ch in channels))

        provisional: dict[str, float] = {}
        for ch in channels:
            target = total_budget * (raw_scores[ch] / score_sum)
            baseline_spend = baseline_by_channel[ch]["spend"]

            lower_bound = max(total_budget * min_pct, baseline_spend * (1.0 - max_shift))
            upper_bound = min(total_budget * max_pct, baseline_spend * (1.0 + max_shift))

            if upper_bound < lower_bound:
                upper_bound = lower_bound

            provisional[ch] = max(lower_bound, min(upper_bound, target))

        provisional_sum = sum(provisional.values())
        if provisional_sum <= 0:
            provisional_sum = 1.0

        scale = total_budget / provisional_sum
        allocations = {ch: provisional[ch] * scale for ch in channels}

        constraint_log: list[str] = []
        channel_rows: list[dict[str, Any]] = []
        weighted_roi_base = 0.0
        weighted_roi_new = 0.0

        for ch in channels:
            baseline_spend = baseline_by_channel[ch]["spend"]
            roi = baseline_by_channel[ch]["roi"]
            allocated = allocations[ch]
            change_pct = ((allocated - baseline_spend) / baseline_spend * 100.0) if baseline_spend > 0 else 0.0
            expected_revenue = allocated * (1.0 + roi)

            if abs(change_pct) >= (request.max_shift_pct - 0.25):
                constraint_log.append(f"{ch}: shift bounded near max change cap ({request.max_shift_pct:.0f}%).")

            channel_rows.append(
                {
                    "channel": ch,
                    "baseline_spend": round(float(baseline_spend), 2),
                    "recommended_spend": round(float(allocated), 2),
                    "delta_amount": round(float(allocated - baseline_spend), 2),
                    "delta_percent": round(float(change_pct), 2),
                    "expected_revenue": round(float(expected_revenue), 2),
                    "expected_roi": round(float(roi), 4),
                    "score": round(float(score_by_channel.get(ch, 0.0)), 4),
                }
            )

            weighted_roi_base += baseline_spend * roi
            weighted_roi_new += allocated * roi

        baseline_roi = weighted_roi_base / max(baseline_total, 1.0)
        projected_roi = weighted_roi_new / max(total_budget, 1.0)
        expected_roi_delta = projected_roi - baseline_roi

        expected_kpi_delta = expected_roi_delta
        low = expected_kpi_delta * 0.75
        high = expected_kpi_delta * 1.25
        if profile == "conservative":
            low = expected_kpi_delta * 0.85
            high = expected_kpi_delta * 1.1
        elif profile == "aggressive":
            low = expected_kpi_delta * 0.6
            high = expected_kpi_delta * 1.45

        channel_rows.sort(key=lambda row: row["recommended_spend"], reverse=True)

        return {
            "channel_allocations": channel_rows,
            "expected_kpi_delta": float(expected_kpi_delta),
            "expected_roi_delta": float(expected_roi_delta),
            "confidence_band": {
                "low": round(float(low), 4),
                "base": round(float(expected_kpi_delta), 4),
                "high": round(float(high), 4),
            },
            "constraint_log": constraint_log,
        }

