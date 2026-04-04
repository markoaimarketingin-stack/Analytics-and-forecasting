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


class ForecastAgent:
    """Predicts future revenue, ROI, and profit from cross-agent signals."""

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
        request = request or ForecastRequest()

        campaign_df = pd.DataFrame(state.campaign_data or [])
        if campaign_df.empty:
            state.forecast_analysis = ForecastAnalysis(
                assumptions=["No campaign data available; forecast is zeroed."],
            )
            return state

        feature_row = self._build_feature_row(campaign_df, state, request.horizon_days)
        model_roi = self._predict_model_roi(feature_row)

        attribution_lift = self._attribution_lift(state)
        funnel_lift = self._funnel_lift(state)
        retention_lift = self._retention_lift(state)

        adjusted_roi = model_roi * attribution_lift * retention_lift
        adjusted_revenue = feature_row["spend"].iloc[0] * (1 + adjusted_roi) * funnel_lift
        adjusted_profit = adjusted_revenue - feature_row["spend"].iloc[0]

        confidence = self._confidence_score(
            campaign_rows=len(campaign_df),
            has_model=self.pipeline is not None,
            has_attribution=state.attribution_analysis is not None,
            has_funnel=state.funnel_analysis is not None,
            has_cohort=state.cohort_analysis is not None,
        )

        state.forecast_analysis = ForecastAnalysis(
            next_30_day_revenue=round(float(adjusted_revenue), 2),
            predicted_roi=round(float(adjusted_roi), 3),
            predicted_profit=round(float(adjusted_profit), 2),
            confidence=confidence,
            key_drivers=self._top_drivers(state),
            assumptions=self._assumptions(
                horizon_days=request.horizon_days,
                model_roi=model_roi,
                attribution_lift=attribution_lift,
                funnel_lift=funnel_lift,
                retention_lift=retention_lift,
            ),
        )
        return state

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
        state: AnalyticsState,
        horizon_days: int,
    ) -> pd.DataFrame:
        df = campaign_df.copy()
        if "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"], errors="coerce")
            now = df["date"].dropna().max() if not df["date"].dropna().empty else pd.Timestamp.now()
        else:
            now = pd.Timestamp.now()

        channel = (
            state.attribution_analysis.best_channel
            if state.attribution_analysis and state.attribution_analysis.best_channel
            else self._mode_or_default(df, "channel", "Unknown")
        )
        campaign_type = self._mode_or_default(df, "campaign_type", "Unknown")

        horizon = int(state.user_request.get("horizon_days", horizon_days))
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

    def _predict_model_roi(self, feature_row: pd.DataFrame) -> float:
        if self.pipeline is None:
            return 0.25

        try:
            prediction = self.pipeline.predict(feature_row)
            return float(prediction[0])
        except Exception:
            return 0.25

    def _attribution_lift(self, state: AnalyticsState) -> float:
        analysis = state.attribution_analysis
        if analysis is None or not analysis.channel_weights:
            return 1.0

        best_weight = max(analysis.channel_weights.values())
        return 1.0 + (best_weight * 0.15)

    def _funnel_lift(self, state: AnalyticsState) -> float:
        analysis = state.funnel_analysis
        if analysis is None:
            return 1.0
        return 1.0 + max(0.0, float(analysis.predicted_conversion_uplift_if_fixed))

    def _retention_lift(self, state: AnalyticsState) -> float:
        analysis = state.cohort_analysis
        if analysis is None:
            return 1.0

        retention = float(analysis.three_month_retention)
        return 1.0 + ((retention - 0.5) * 0.5)

    def _confidence_score(
        self,
        campaign_rows: int,
        has_model: bool,
        has_attribution: bool,
        has_funnel: bool,
        has_cohort: bool,
    ) -> int:
        score = 50
        score += min(20, int(campaign_rows / 20))
        score += 10 if has_model else 0
        score += 6 if has_attribution else 0
        score += 6 if has_funnel else 0
        score += 8 if has_cohort else 0
        return max(35, min(95, score))

    def _top_drivers(self, state: AnalyticsState) -> list[str]:
        drivers: list[str] = []

        if state.attribution_analysis and state.attribution_analysis.best_channel:
            drivers.append(f"Attribution mix strength in {state.attribution_analysis.best_channel}")

        if state.funnel_analysis:
            drivers.append(f"Funnel leakage at {state.funnel_analysis.largest_dropoff}")

        if state.cohort_analysis:
            drivers.append(f"Three-month retention at {state.cohort_analysis.three_month_retention:.1%}")

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
        attribution_lift: float,
        funnel_lift: float,
        retention_lift: float,
    ) -> list[str]:
        return [
            f"Forecast horizon is {horizon_days} days.",
            f"Base model ROI prediction is {model_roi:.3f}.",
            f"Attribution-adjusted lift multiplier is {attribution_lift:.3f}.",
            f"Funnel uplift multiplier is {funnel_lift:.3f}.",
            f"Retention-adjusted lift multiplier is {retention_lift:.3f}.",
        ]

    def _mode_or_default(self, df: pd.DataFrame, column: str, default: str) -> str:
        if column not in df.columns or df[column].dropna().empty:
            return default
        return str(df[column].mode().iloc[0])
