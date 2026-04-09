from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from analytics_agent.state import AnalyticsState, ScenarioAnalysis


@dataclass
class ScenarioRequest:
    horizon_days: int = 90
    kpi_metric: str = "revenue"
    channel: str = "all"
    campaign_type: str = "all"
    campaign_id: str = "all"
    base_spend_change_pct: float = 0.0
    base_ctr_lift_pct: float = 0.0
    base_conversion_lift_pct: float = 0.0
    base_aov_change_pct: float = 0.0
    seasonality_factor: float = 1.0


class ScenarioAgent:
    """Builds scenario-only projections from campaigns data."""

    def analyze(
        self,
        state: AnalyticsState,
        request: ScenarioRequest | None = None,
    ) -> AnalyticsState:
        request = request or self._build_request_from_state(state)

        campaign_df = pd.DataFrame(state.campaign_data or [])
        if campaign_df.empty:
            state.scenario_analysis = ScenarioAnalysis(
                assumptions=["No campaign data available in Supabase for scenario analysis."],
                data_source="supabase",
            )
            return state

        filtered_df = self._apply_filters(campaign_df, request)
        if filtered_df.empty:
            state.scenario_analysis = ScenarioAnalysis(
                assumptions=["No matching campaign rows for selected scenario filters."],
                applied_filters={
                    "channel": request.channel,
                    "campaign_type": request.campaign_type,
                    "campaign_id": request.campaign_id,
                },
                data_source="supabase",
            )
            return state

        base = self._compute_base_metrics(filtered_df)
        variants = self._build_variant_metrics(base, request)

        best_case = self._extract_case_metrics(variants["best"])
        base_case = self._extract_case_metrics(variants["base"])
        worst_case = self._extract_case_metrics(variants["worst"])

        projection_curve = self._build_projection_curve(variants, request.horizon_days)
        sensitivity_curve = self._build_sensitivity_curve(base, request)
        channel_scenario = self._build_channel_scenario(filtered_df, variants)

        state.scenario_analysis = ScenarioAnalysis(
            best_case=best_case,
            base_case=base_case,
            worst_case=worst_case,
            kpi_metric=request.kpi_metric,
            scenario_table=[
                {"scenario": "Best", **best_case},
                {"scenario": "Base", **base_case},
                {"scenario": "Worst", **worst_case},
            ],
            projection_curve=projection_curve,
            sensitivity_curve=sensitivity_curve,
            channel_scenario=channel_scenario,
            baseline_metrics={
                "spend": round(float(base["spend"]), 2),
                "revenue": round(float(base["revenue"]), 2),
                "roi": round(float(base["roi"]), 4),
                "profit": round(float(base["profit"]), 2),
                "clicks": round(float(base["clicks"]), 2),
                "purchases": round(float(base["purchases"]), 2),
            },
            assumptions=self._build_assumptions(request),
            applied_filters={
                "channel": request.channel,
                "campaign_type": request.campaign_type,
                "campaign_id": request.campaign_id,
                "horizon_days": request.horizon_days,
            },
            diagnostics={
                "rows_used": int(len(filtered_df.index)),
                "date_days": int(base["date_days"]),
                "kpi_metric": request.kpi_metric,
            },
            data_source="supabase",
        )
        return state

    def _build_request_from_state(self, state: AnalyticsState) -> ScenarioRequest:
        req = state.user_request or {}
        return ScenarioRequest(
            horizon_days=int(req.get("horizon_days", 90)),
            kpi_metric=str(req.get("kpi_metric", "revenue")),
            channel=str(req.get("channel", "all")),
            campaign_type=str(req.get("campaign_type", "all")),
            campaign_id=str(req.get("campaign_id", "all")),
            base_spend_change_pct=float(req.get("base_spend_change_pct", 0.0)),
            base_ctr_lift_pct=float(req.get("base_ctr_lift_pct", 0.0)),
            base_conversion_lift_pct=float(req.get("base_conversion_lift_pct", 0.0)),
            base_aov_change_pct=float(req.get("base_aov_change_pct", 0.0)),
            seasonality_factor=float(req.get("seasonality_factor", 1.0)),
        )

    def _apply_filters(self, campaign_df: pd.DataFrame, request: ScenarioRequest) -> pd.DataFrame:
        filtered = campaign_df.copy()

        if request.channel and request.channel.lower() != "all" and "channel" in filtered.columns:
            filtered = filtered[filtered["channel"].astype(str) == request.channel]

        if request.campaign_type and request.campaign_type.lower() != "all" and "campaign_type" in filtered.columns:
            filtered = filtered[filtered["campaign_type"].astype(str) == request.campaign_type]

        if request.campaign_id and request.campaign_id.lower() != "all" and "campaign_id" in filtered.columns:
            filtered = filtered[filtered["campaign_id"].astype(str) == request.campaign_id]

        return filtered

    def _safe_sum(self, df: pd.DataFrame, column: str) -> float:
        if column not in df.columns:
            return 0.0
        return float(pd.to_numeric(df[column], errors="coerce").fillna(0.0).sum())

    def _compute_base_metrics(self, df: pd.DataFrame) -> dict[str, float]:
        spend = self._safe_sum(df, "spend")
        revenue = self._safe_sum(df, "revenue")
        impressions = self._safe_sum(df, "impressions")
        clicks = self._safe_sum(df, "clicks")
        purchases = self._safe_sum(df, "purchases")

        if "date" in df.columns:
            dates = pd.to_datetime(df["date"], errors="coerce").dropna()
            date_days = max(1, int((dates.max() - dates.min()).days) + 1) if not dates.empty else max(1, min(30, len(df)))
        else:
            date_days = max(1, min(30, len(df)))

        ctr = clicks / impressions if impressions > 0 else 0.0
        conversion_rate = purchases / clicks if clicks > 0 else 0.0
        aov = revenue / purchases if purchases > 0 else 0.0
        roi = (revenue - spend) / spend if spend > 0 else 0.0
        profit = revenue - spend

        return {
            "spend": spend,
            "revenue": revenue,
            "impressions": impressions,
            "clicks": clicks,
            "purchases": purchases,
            "ctr": ctr,
            "conversion_rate": conversion_rate,
            "aov": aov,
            "roi": roi,
            "profit": profit,
            "date_days": float(date_days),
        }

    def _build_variant_metrics(self, base: dict[str, float], request: ScenarioRequest) -> dict[str, dict[str, float]]:
        variants = {
            "best": {
                "spend_change_pct": request.base_spend_change_pct + 20,
                "ctr_lift_pct": request.base_ctr_lift_pct + 12,
                "conversion_lift_pct": request.base_conversion_lift_pct + 15,
                "aov_change_pct": request.base_aov_change_pct + 10,
                "seasonality": max(0.2, request.seasonality_factor + 0.08),
            },
            "base": {
                "spend_change_pct": request.base_spend_change_pct,
                "ctr_lift_pct": request.base_ctr_lift_pct,
                "conversion_lift_pct": request.base_conversion_lift_pct,
                "aov_change_pct": request.base_aov_change_pct,
                "seasonality": max(0.2, request.seasonality_factor),
            },
            "worst": {
                "spend_change_pct": request.base_spend_change_pct - 20,
                "ctr_lift_pct": request.base_ctr_lift_pct - 12,
                "conversion_lift_pct": request.base_conversion_lift_pct - 15,
                "aov_change_pct": request.base_aov_change_pct - 8,
                "seasonality": max(0.2, request.seasonality_factor - 0.08),
            },
        }

        out: dict[str, dict[str, float]] = {}
        for key, cfg in variants.items():
            spend = base["spend"] * (1.0 + cfg["spend_change_pct"] / 100.0)
            ctr = max(0.0001, min(0.99, base["ctr"] * (1.0 + cfg["ctr_lift_pct"] / 100.0)))
            cvr = max(0.0001, min(0.99, base["conversion_rate"] * (1.0 + cfg["conversion_lift_pct"] / 100.0)))
            aov = max(0.01, base["aov"] * (1.0 + cfg["aov_change_pct"] / 100.0))

            clicks = base["clicks"] * (spend / max(base["spend"], 1.0)) * (ctr / max(base["ctr"], 0.0001))
            purchases = clicks * cvr
            revenue = purchases * aov * cfg["seasonality"]
            profit = revenue - spend
            roi = (profit / spend) if spend > 0 else 0.0

            out[key] = {
                "spend": spend,
                "revenue": revenue,
                "profit": profit,
                "roi": roi,
                "clicks": clicks,
                "purchases": purchases,
                "impressions": clicks / ctr,
                "conversion_rate": cvr,
                "ctr": ctr,
            }

        return out

    def _extract_case_metrics(self, values: dict[str, float]) -> dict[str, float]:
        return {
            "revenue": round(float(values["revenue"]), 2),
            "roi": round(float(values["roi"]), 4),
            "profit": round(float(values["profit"]), 2),
            "spend": round(float(values["spend"]), 2),
            "clicks": round(float(values["clicks"]), 2),
            "purchases": round(float(values["purchases"]), 2),
        }

    def _build_projection_curve(self, variants: dict[str, dict[str, float]], horizon_days: int) -> list[dict[str, float]]:
        steps = min(max(8, horizon_days), 60)
        interval = max(1, int(horizon_days / steps))
        rows: list[dict[str, float]] = []

        for day in range(1, horizon_days + 1, interval):
            progress = day / max(1, horizon_days)
            rows.append(
                {
                    "day": float(day),
                    "best": round(float(variants["best"]["revenue"] * progress), 2),
                    "base": round(float(variants["base"]["revenue"] * progress), 2),
                    "worst": round(float(variants["worst"]["revenue"] * progress), 2),
                }
            )

        return rows

    def _build_sensitivity_curve(self, base: dict[str, float], request: ScenarioRequest) -> list[dict[str, float]]:
        rows: list[dict[str, float]] = []
        for delta in [-30, -20, -10, 0, 10, 20, 30]:
            spend_change = request.base_spend_change_pct + delta
            spend = base["spend"] * (1.0 + spend_change / 100.0)
            revenue = base["revenue"] * (1.0 + (spend_change * 0.7) / 100.0)
            profit = revenue - spend
            roi = (profit / spend) if spend > 0 else 0.0

            rows.append(
                {
                    "delta": float(delta),
                    "revenue": round(float(revenue), 2),
                    "profit": round(float(profit), 2),
                    "roi": round(float(roi), 4),
                }
            )
        return rows

    def _build_channel_scenario(self, df: pd.DataFrame, variants: dict[str, dict[str, float]]) -> list[dict[str, float]]:
        if "channel" not in df.columns:
            return []

        grouped = df.groupby("channel", as_index=False)[[col for col in ["spend", "revenue"] if col in df.columns]].sum()
        total_revenue = float(grouped["revenue"].sum()) if "revenue" in grouped.columns else 0.0
        total_revenue = max(total_revenue, 1.0)

        rows: list[dict[str, float]] = []
        for _, row in grouped.iterrows():
            channel = str(row.get("channel", "Unknown"))
            share = float(row.get("revenue", 0.0)) / total_revenue
            rows.append(
                {
                    "channel": channel,
                    "best_revenue": round(float(variants["best"]["revenue"] * share), 2),
                    "base_revenue": round(float(variants["base"]["revenue"] * share), 2),
                    "worst_revenue": round(float(variants["worst"]["revenue"] * share), 2),
                }
            )

        return sorted(rows, key=lambda item: item["base_revenue"], reverse=True)

    def _build_assumptions(self, request: ScenarioRequest) -> list[str]:
        return [
            f"Scenario horizon is {request.horizon_days} days.",
            f"Base spend adjustment set to {request.base_spend_change_pct:.1f}%.",
            f"Base CTR lift set to {request.base_ctr_lift_pct:.1f}%.",
            f"Base conversion lift set to {request.base_conversion_lift_pct:.1f}%.",
            f"Base AOV change set to {request.base_aov_change_pct:.1f}%.",
            f"Seasonality factor set to {request.seasonality_factor:.2f}.",
        ]
