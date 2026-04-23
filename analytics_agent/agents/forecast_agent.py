from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from analytics_agent.state import AnalyticsState, ForecastAnalysis


FEATURE_COLUMNS = [
    "channel",
    "campaign_type",
    "spend",
    "impressions",
    "clicks",
    "ctr",
    "landing_page_views",
    "add_to_cart",
    "conversion_rate",
    "purchases",
    "month",
    "quarter",
    "is_weekend",
]


@dataclass
class ForecastRequest:
    horizon_days: int = 30
    kpi_metric: str = "revenue"
    channel: str = "all"
    campaign_type: str = "all"
    campaign_id: str = "all"
    spend_change_pct: float = 0.0
    ctr_lift_pct: float = 0.0
    conversion_lift_pct: float = 0.0
    cpc_change_pct: float = 0.0
    aov_change_pct: float = 0.0
    seasonality_factor: float = 1.0


class ForecastAgent:
    """Predicts forecast outcomes from campaigns data only (no cross-agent blending)."""

    def __init__(self, model_path: str = "analytics_agent/models/forecast_model.pkl"):
        self.model_path = Path(model_path)
        self.pipeline: Any | None = None
        self.feature_names: list[str] = []
        self._load_model()

    def analyze(
        self,
        state: AnalyticsState,
        request: ForecastRequest | None = None,
    ) -> AnalyticsState:
        request = request or self._build_request_from_state(state)

        campaign_df = pd.DataFrame(state.campaign_data or [])
        if campaign_df.empty:
            state.forecast_analysis = ForecastAnalysis(
                assumptions=["No campaign data available; forecast is zeroed."],
                data_source="supabase",
            )
            return state

        filtered_df = self._apply_filters(campaign_df, request)
        if filtered_df.empty:
            state.forecast_analysis = ForecastAnalysis(
                assumptions=["No matching campaign rows for selected filters."],
                applied_filters={
                    "channel": request.channel,
                    "campaign_type": request.campaign_type,
                    "campaign_id": request.campaign_id,
                },
                data_source="supabase",
            )
            return state

        feature_row = self._build_feature_row(filtered_df, request.horizon_days)
        model_roi = self._predict_model_roi(feature_row)
        metrics = self._calculate_forecast_metrics(filtered_df, request, model_roi)

        confidence = self._confidence_score(
            campaign_rows=len(filtered_df),
            has_model=self.pipeline is not None,
            date_coverage_days=metrics["date_coverage_days"],
        )

        forecast_points = self._build_forecast_points(metrics, request.horizon_days)
        channel_forecast = self._build_channel_forecast(filtered_df, metrics)
        kpi_projection = self._select_kpi_projection(request.kpi_metric, metrics)

        state.forecast_analysis = ForecastAnalysis(
            next_30_day_revenue=round(float(metrics["predicted_revenue"]), 2),
            predicted_roi=round(float(metrics["predicted_roi"]), 3),
            predicted_profit=round(float(metrics["predicted_profit"]), 2),
            predicted_purchases=round(float(metrics["predicted_purchases"]), 2),
            predicted_clicks=round(float(metrics["predicted_clicks"]), 2),
            predicted_impressions=round(float(metrics["predicted_impressions"]), 2),
            predicted_conversion_rate=round(float(metrics["predicted_conversion_rate"]), 4),
            predicted_ctr=round(float(metrics["predicted_ctr"]), 4),
            confidence=confidence,
            key_drivers=self._top_drivers(filtered_df, metrics, request),
            assumptions=self._assumptions(
                horizon_days=request.horizon_days,
                model_roi=model_roi,
                request=request,
            ),
            kpi_metric=request.kpi_metric,
            kpi_projection=round(float(kpi_projection), 2),
            forecast_points=forecast_points,
            channel_forecast=channel_forecast,
            baseline_metrics={
                "spend": round(float(metrics["baseline_spend"]), 2),
                "revenue": round(float(metrics["baseline_revenue"]), 2),
                "roi": round(float(metrics["baseline_roi"]), 3),
                "clicks": round(float(metrics["baseline_clicks"]), 2),
                "purchases": round(float(metrics["baseline_purchases"]), 2),
            },
            applied_filters={
                "channel": request.channel,
                "campaign_type": request.campaign_type,
                "campaign_id": request.campaign_id,
                "horizon_days": request.horizon_days,
            },
            diagnostics={
                "rows_used": int(len(filtered_df.index)),
                "date_coverage_days": int(metrics["date_coverage_days"]),
                "daily_growth_rate": round(float(metrics["daily_growth_rate"]), 6),
            },
            data_source="supabase",
        )
        return state

    def _build_request_from_state(self, state: AnalyticsState) -> ForecastRequest:
        req = state.user_request or {}
        return ForecastRequest(
            horizon_days=int(req.get("horizon_days", 30)),
            kpi_metric=str(req.get("kpi_metric", "revenue")),
            channel=str(req.get("channel", "all")),
            campaign_type=str(req.get("campaign_type", "all")),
            campaign_id=str(req.get("campaign_id", "all")),
            spend_change_pct=float(req.get("spend_change_pct", 0.0)),
            ctr_lift_pct=float(req.get("ctr_lift_pct", 0.0)),
            conversion_lift_pct=float(req.get("conversion_lift_pct", 0.0)),
            cpc_change_pct=float(req.get("cpc_change_pct", 0.0)),
            aov_change_pct=float(req.get("aov_change_pct", 0.0)),
            seasonality_factor=float(req.get("seasonality_factor", 1.0)),
        )

    def _load_model(self) -> None:
        candidates = [
            self.model_path,
            Path("analytics_agent/api/analytics_agent/models/forecast_model.pkl"),
        ]

        for candidate in candidates:
            if not candidate.exists():
                continue

            saved = joblib.load(candidate)
            if isinstance(saved, dict):
                self.pipeline = saved.get("pipeline")
                self.feature_names = saved.get("feature_names", [])
            else:
                self.pipeline = saved
                self.feature_names = []
            return

    def _build_feature_row(
        self,
        campaign_df: pd.DataFrame,
        horizon_days: int,
    ) -> pd.DataFrame:
        df = campaign_df.copy()
        if "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"], errors="coerce")
            now = df["date"].dropna().max() if not df["date"].dropna().empty else pd.Timestamp.now()
        else:
            now = pd.Timestamp.now()

        channel = self._mode_or_default(df, "channel", "Unknown")
        campaign_type = self._mode_or_default(df, "campaign_type", "Unknown")

        horizon = int(horizon_days)
        avg_daily_spend = float(df["spend"].mean()) if "spend" in df.columns else 0.0
        spend_horizon = avg_daily_spend * horizon

        ctr = float(df["ctr"].mean()) if "ctr" in df.columns else 0.0
        conversion_rate = float(df["conversion_rate"].mean()) if "conversion_rate" in df.columns else 0.0
        impressions = int(float(df["impressions"].mean())) if "impressions" in df.columns else 0

        clicks = int(impressions * ctr)
        landing_page_views = int(clicks * 0.65)
        add_to_cart = int(landing_page_views * 0.18)
        purchases = int(add_to_cart * conversion_rate)

        data = {
            "channel": channel,
            "campaign_type": campaign_type,
            "spend": spend_horizon,
            "impressions": impressions,
            "clicks": clicks,
            "ctr": ctr,
            "landing_page_views": landing_page_views,
            "add_to_cart": add_to_cart,
            "conversion_rate": conversion_rate,
            "purchases": purchases,
            "month": int(now.month),
            "quarter": int(now.quarter),
            "is_weekend": int(now.dayofweek >= 5),
        }

        row = pd.DataFrame([data])
        for feature in FEATURE_COLUMNS:
            if feature not in row.columns:
                row[feature] = 0
        return row[FEATURE_COLUMNS]

    def _apply_filters(self, campaign_df: pd.DataFrame, request: ForecastRequest) -> pd.DataFrame:
        filtered = campaign_df.copy()

        if request.channel and request.channel.lower() != "all" and "channel" in filtered.columns:
            target = str(request.channel).strip().casefold()
            series = filtered["channel"].astype(str).str.strip().str.casefold()
            filtered = filtered[series == target]

        if request.campaign_type and request.campaign_type.lower() != "all" and "campaign_type" in filtered.columns:
            target = str(request.campaign_type).strip().casefold()
            series = filtered["campaign_type"].astype(str).str.strip().str.casefold()
            filtered = filtered[series == target]

        if request.campaign_id and request.campaign_id.lower() != "all" and "campaign_id" in filtered.columns:
            target = str(request.campaign_id).strip().casefold()
            series = filtered["campaign_id"].astype(str).str.strip().str.casefold()
            filtered = filtered[series == target]

        return filtered

    def _safe_sum(self, df: pd.DataFrame, column: str) -> float:
        if column not in df.columns:
            return 0.0
        return float(pd.to_numeric(df[column], errors="coerce").fillna(0.0).sum())

    def _safe_mean(self, df: pd.DataFrame, column: str) -> float:
        if column not in df.columns:
            return 0.0
        series = pd.to_numeric(df[column], errors="coerce").dropna()
        return float(series.mean()) if not series.empty else 0.0

    def _ratio(self, numerator: float, denominator: float, default: float = 0.0) -> float:
        return (numerator / denominator) if denominator > 0 else default

    def _calculate_forecast_metrics(self, df: pd.DataFrame, request: ForecastRequest, model_roi: float) -> dict[str, float]:
        spend_total = self._safe_sum(df, "spend")
        revenue_total = self._safe_sum(df, "revenue")
        impressions_total = self._safe_sum(df, "impressions")
        clicks_total = self._safe_sum(df, "clicks")
        purchases_total = self._safe_sum(df, "purchases")
        lpv_total = self._safe_sum(df, "landing_page_views")
        atc_total = self._safe_sum(df, "add_to_cart")

        if "date" in df.columns:
            date_series = pd.to_datetime(df["date"], errors="coerce").dropna()
            if not date_series.empty:
                date_coverage_days = max(1, int((date_series.max() - date_series.min()).days) + 1)
            else:
                date_coverage_days = max(1, min(30, len(df)))
        else:
            date_coverage_days = max(1, min(30, len(df)))

        base_daily_spend = spend_total / date_coverage_days
        base_ctr = self._ratio(clicks_total, impressions_total, default=self._safe_mean(df, "ctr"))
        base_cvr = self._ratio(purchases_total, clicks_total, default=self._safe_mean(df, "conversion_rate"))
        base_aov = self._ratio(revenue_total, purchases_total, default=self._safe_mean(df, "aov"))
        base_roi = self._ratio(revenue_total - spend_total, spend_total, default=model_roi)
        base_cpc = self._ratio(spend_total, clicks_total, default=1.0)
        lpv_rate = self._ratio(lpv_total, clicks_total, default=0.65)
        atc_rate = self._ratio(atc_total, lpv_total, default=0.18)

        spend_multiplier = max(0.01, 1.0 + (request.spend_change_pct / 100.0))
        ctr_multiplier = max(0.05, 1.0 + (request.ctr_lift_pct / 100.0))
        cvr_multiplier = max(0.05, 1.0 + (request.conversion_lift_pct / 100.0))
        cpc_multiplier = max(0.05, 1.0 + (request.cpc_change_pct / 100.0))
        aov_multiplier = max(0.05, 1.0 + (request.aov_change_pct / 100.0))
        seasonality = max(0.2, request.seasonality_factor)

        predicted_spend = base_daily_spend * request.horizon_days * spend_multiplier
        predicted_ctr = min(0.99, base_ctr * ctr_multiplier)
        predicted_cvr = min(0.99, base_cvr * cvr_multiplier)
        predicted_cpc = max(0.01, base_cpc * cpc_multiplier)
        predicted_aov = max(0.01, base_aov * aov_multiplier)

        predicted_clicks = predicted_spend / predicted_cpc
        predicted_impressions = predicted_clicks / max(0.0001, predicted_ctr)
        predicted_lpv = predicted_clicks * lpv_rate
        predicted_atc = predicted_lpv * atc_rate
        predicted_purchases = max(predicted_atc * 0.4, predicted_clicks * predicted_cvr)

        predicted_revenue = predicted_purchases * predicted_aov * seasonality
        predicted_roi = self._ratio(predicted_revenue - predicted_spend, predicted_spend, default=model_roi)
        predicted_profit = predicted_revenue - predicted_spend
        daily_growth_rate = self._estimate_daily_growth(df)

        return {
            "baseline_spend": spend_total,
            "baseline_revenue": revenue_total,
            "baseline_roi": base_roi,
            "baseline_clicks": clicks_total,
            "baseline_purchases": purchases_total,
            "predicted_spend": predicted_spend,
            "predicted_revenue": predicted_revenue,
            "predicted_roi": predicted_roi,
            "predicted_profit": predicted_profit,
            "predicted_clicks": predicted_clicks,
            "predicted_impressions": predicted_impressions,
            "predicted_purchases": predicted_purchases,
            "predicted_conversion_rate": predicted_cvr,
            "predicted_ctr": predicted_ctr,
            "daily_growth_rate": daily_growth_rate,
            "date_coverage_days": float(date_coverage_days),
        }

    def _estimate_daily_growth(self, df: pd.DataFrame) -> float:
        if "date" not in df.columns or "revenue" not in df.columns:
            return 0.002

        tmp = df.copy()
        tmp["date"] = pd.to_datetime(tmp["date"], errors="coerce")
        tmp["revenue"] = pd.to_numeric(tmp["revenue"], errors="coerce").fillna(0.0)
        tmp = tmp.dropna(subset=["date"])
        if tmp.empty:
            return 0.002

        series = tmp.groupby(tmp["date"].dt.date, as_index=False)["revenue"].sum()
        if len(series.index) < 4:
            return 0.002

        first = float(series["revenue"].iloc[: max(1, len(series.index) // 3)].mean())
        last = float(series["revenue"].iloc[-max(1, len(series.index) // 3):].mean())
        if first <= 0:
            return 0.002

        ratio = max(0.5, min(1.8, last / first))
        daily = ratio ** (1.0 / max(1, len(series.index) - 1)) - 1.0
        return float(max(-0.01, min(0.02, daily)))

    def _build_forecast_points(self, metrics: dict[str, float], horizon_days: int) -> list[dict[str, float]]:
        points: list[dict[str, float]] = []
        steps = min(max(8, horizon_days), 60)
        interval = max(1, int(horizon_days / steps))

        base_daily_spend = metrics["predicted_spend"] / max(1, horizon_days)
        base_daily_clicks = metrics["predicted_clicks"] / max(1, horizon_days)
        base_daily_purchases = metrics["predicted_purchases"] / max(1, horizon_days)
        base_daily_revenue = metrics["predicted_revenue"] / max(1, horizon_days)
        growth = metrics.get("daily_growth_rate", 0.0)

        cumulative_spend = 0.0
        cumulative_revenue = 0.0
        for day in range(1, horizon_days + 1, interval):
            factor = (1.0 + growth) ** (day - 1)
            spend = base_daily_spend * factor * interval
            clicks = base_daily_clicks * factor * interval
            purchases = base_daily_purchases * factor * interval
            revenue = base_daily_revenue * factor * interval

            cumulative_spend += spend
            cumulative_revenue += revenue
            roi = self._ratio(cumulative_revenue - cumulative_spend, cumulative_spend, 0.0)

            points.append(
                {
                    "day": float(day),
                    "spend": round(float(cumulative_spend), 2),
                    "revenue": round(float(cumulative_revenue), 2),
                    "profit": round(float(cumulative_revenue - cumulative_spend), 2),
                    "roi": round(float(roi), 4),
                    "clicks": round(float(clicks), 2),
                    "purchases": round(float(purchases), 2),
                }
            )

        return points

    def _build_channel_forecast(self, df: pd.DataFrame, metrics: dict[str, float]) -> list[dict[str, float]]:
        if "channel" not in df.columns:
            return []

        by_channel = (
            df.groupby("channel", as_index=False)[[col for col in ["spend", "revenue", "purchases"] if col in df.columns]]
            .sum()
        )
        if by_channel.empty:
            return []

        total_spend = float(by_channel["spend"].sum()) if "spend" in by_channel.columns else 0.0
        total_spend = max(total_spend, 1.0)

        rows: list[dict[str, float]] = []
        for _, row in by_channel.iterrows():
            channel = str(row.get("channel", "Unknown"))
            spend_share = float(row.get("spend", 0.0)) / total_spend
            projected_spend = metrics["predicted_spend"] * spend_share
            projected_revenue = metrics["predicted_revenue"] * spend_share
            projected_purchases = metrics["predicted_purchases"] * spend_share
            projected_roi = self._ratio(projected_revenue - projected_spend, projected_spend, 0.0)

            rows.append(
                {
                    "channel": channel,
                    "projected_spend": round(float(projected_spend), 2),
                    "projected_revenue": round(float(projected_revenue), 2),
                    "projected_purchases": round(float(projected_purchases), 2),
                    "projected_roi": round(float(projected_roi), 4),
                }
            )

        return sorted(rows, key=lambda item: item["projected_revenue"], reverse=True)

    def _select_kpi_projection(self, kpi_metric: str, metrics: dict[str, float]) -> float:
        key = (kpi_metric or "revenue").strip().lower()
        lookup = {
            "revenue": metrics["predicted_revenue"],
            "profit": metrics["predicted_profit"],
            "roi": metrics["predicted_roi"],
            "spend": metrics["predicted_spend"],
            "clicks": metrics["predicted_clicks"],
            "purchases": metrics["predicted_purchases"],
            "impressions": metrics["predicted_impressions"],
            "conversion_rate": metrics["predicted_conversion_rate"],
            "ctr": metrics["predicted_ctr"],
        }
        return float(lookup.get(key, metrics["predicted_revenue"]))

    def _predict_model_roi(self, feature_row: pd.DataFrame) -> float:
        if self.pipeline is None:
            return 0.25

        try:
            prediction = self.pipeline.predict(feature_row)
            return float(prediction[0])
        except Exception:
            return 0.25

    def _confidence_score(
        self,
        campaign_rows: int,
        has_model: bool,
        date_coverage_days: float,
    ) -> int:
        score = 50
        score += min(20, int(campaign_rows / 20))
        score += 10 if has_model else 0
        score += min(20, int(date_coverage_days / 10))
        return max(35, min(95, score))

    def _top_drivers(self, campaign_df: pd.DataFrame, metrics: dict[str, float], request: ForecastRequest) -> list[str]:
        drivers: list[str] = []

        if "channel" in campaign_df.columns and not campaign_df.empty:
            channel_spend = campaign_df.groupby("channel", as_index=False)["spend"].sum().sort_values("spend", ascending=False)
            if not channel_spend.empty:
                drivers.append(f"Top spend channel: {channel_spend.iloc[0]['channel']}")

        drivers.append(f"Horizon set to {request.horizon_days} days")
        drivers.append(f"Projected ROI: {metrics['predicted_roi']:.2f}")

        if self.feature_names:
            top_features = ", ".join(self.feature_names[:3])
            drivers.append(f"Model feature salience: {top_features}")

        if not drivers:
            drivers.append("Historical spend and conversion averages")
        return drivers

    def _assumptions(
        self,
        horizon_days: int,
        model_roi: float,
        request: ForecastRequest,
    ) -> list[str]:
        return [
            f"Forecast horizon is {horizon_days} days.",
            f"Base model ROI prediction is {model_roi:.3f}.",
            f"Spend change assumption: {request.spend_change_pct:.1f}%.",
            f"CTR lift assumption: {request.ctr_lift_pct:.1f}%.",
            f"Conversion lift assumption: {request.conversion_lift_pct:.1f}%.",
            f"CPC change assumption: {request.cpc_change_pct:.1f}%.",
            f"AOV change assumption: {request.aov_change_pct:.1f}%.",
            f"Seasonality factor: {request.seasonality_factor:.2f}.",
        ]

    def _mode_or_default(self, df: pd.DataFrame, column: str, default: str) -> str:
        if column not in df.columns or df[column].dropna().empty:
            return default
        return str(df[column].mode().iloc[0])
