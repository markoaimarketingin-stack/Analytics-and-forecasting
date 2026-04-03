
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Any, List
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from analytics_agent.db.queries import get_campaign_data, get_retention_data


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

CATEGORICAL_COLUMNS = ["channel", "campaign_type"]
NUMERIC_COLUMNS = [
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
    channel: str
    campaign_type: str
    spend: float
    impressions: int
    ctr: float
    conversion_rate: float
    horizon_days: int = 30


class ForecastAgent:
    def __init__(self, model_path: str = "analytics_agent/models/forecast_model.pkl"):
        self.model_path = Path(model_path)
        self.pipeline: Pipeline | None = None
        self.feature_names: list[str] = []

        if self.model_path.exists():
            saved = joblib.load(self.model_path)
            self.pipeline = saved["pipeline"]
            self.feature_names = saved.get("feature_names", [])

    # --------------------------------------------------
    # TRAIN MODEL
    # --------------------------------------------------
    def train(self) -> Dict[str, Any]:
        df = pd.DataFrame(get_campaign_data())

        if df.empty:
            raise ValueError("No campaign data found")

        df = self._prepare_dataframe(df)

        X = df[FEATURE_COLUMNS]
        y = df["roi"]

        split_idx = int(len(df) * 0.8)

        X_train = X.iloc[:split_idx]
        X_test = X.iloc[split_idx:]
        y_train = y.iloc[:split_idx]
        y_test = y.iloc[split_idx:]

        categorical_transformer = Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="most_frequent")),
                ("onehot", OneHotEncoder(handle_unknown="ignore")),
            ]
        )

        numeric_transformer = Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="median")),
            ]
        )

        preprocessor = ColumnTransformer(
            transformers=[
                ("cat", categorical_transformer, CATEGORICAL_COLUMNS),
                ("num", numeric_transformer, NUMERIC_COLUMNS),
            ]
        )

        model = RandomForestRegressor(
            n_estimators=150,
            max_depth=8,
            min_samples_split=8,
            min_samples_leaf=3,
            random_state=42,
            n_jobs=-1,
        )

        pipeline = Pipeline(
            steps=[
                ("preprocessor", preprocessor),
                ("model", model),
            ]
        )

        pipeline.fit(X_train, y_train)

        preds = pipeline.predict(X_test)

        rmse = float(np.sqrt(mean_squared_error(y_test, preds)))
        mae = float(mean_absolute_error(y_test, preds))

        ohe = pipeline.named_steps["preprocessor"].named_transformers_["cat"].named_steps["onehot"]
        cat_names = list(ohe.get_feature_names_out(CATEGORICAL_COLUMNS))
        self.feature_names = cat_names + NUMERIC_COLUMNS

        self.pipeline = pipeline

        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {
                "pipeline": pipeline,
                "feature_names": self.feature_names,
            },
            self.model_path,
        )

        return {
            "status": "trained",
            "rows": len(df),
            "rmse": round(rmse, 4),
            "mae": round(mae, 4),
            "model": "RandomForestRegressor",
        }

    # --------------------------------------------------
    # PREDICT A NEW CAMPAIGN
    # --------------------------------------------------
    def predict_campaign(self, request: ForecastRequest) -> Dict[str, Any]:
        if self.pipeline is None:
            raise ValueError("Forecast model not trained")

        clicks = int(request.impressions * request.ctr)
        landing_page_views = int(clicks * 0.65)
        add_to_cart = int(landing_page_views * 0.18)
        purchases = int(add_to_cart * request.conversion_rate)

        now = pd.Timestamp.now()

        row = pd.DataFrame(
            [
                {
                    "channel": request.channel,
                    "campaign_type": request.campaign_type,
                    "spend": request.spend,
                    "impressions": request.impressions,
                    "clicks": clicks,
                    "ctr": request.ctr,
                    "landing_page_views": landing_page_views,
                    "add_to_cart": add_to_cart,
                    "conversion_rate": request.conversion_rate,
                    "purchases": purchases,
                    "month": now.month,
                    "quarter": now.quarter,
                    "is_weekend": int(now.dayofweek >= 5),
                }
            ]
        )

        predicted_roi = float(self.pipeline.predict(row)[0])

        predicted_revenue = request.spend * (1 + predicted_roi)
        predicted_profit = predicted_revenue - request.spend

        return {
            "predicted_roi": round(predicted_roi, 3),
            "predicted_revenue": round(predicted_revenue, 2),
            "predicted_profit": round(predicted_profit, 2),
            "predicted_clicks": clicks,
            "predicted_purchases": purchases,
            "retention_adjustment": self._get_retention_adjustment(),
            "daily_forecast": self._forecast_over_time(
                request.spend,
                predicted_roi,
                request.horizon_days,
            ),
            "top_drivers": self._top_drivers(),
        }

    # --------------------------------------------------
    # DAILY FORECAST CURVE
    # --------------------------------------------------
    def _forecast_over_time(
        self,
        base_spend: float,
        base_roi: float,
        horizon_days: int,
    ) -> List[Dict[str, Any]]:
        forecasts = []

        for day in range(1, horizon_days + 1):
            growth_factor = 1 + (day * 0.002)
            weekend_boost = 1.08 if day % 7 in [5, 6] else 1.0

            spend = base_spend * growth_factor
            roi = base_roi * weekend_boost
            revenue = spend * (1 + roi)
            profit = revenue - spend

            forecasts.append(
                {
                    "day": day,
                    "forecast_spend": round(spend, 2),
                    "forecast_roi": round(roi, 3),
                    "forecast_revenue": round(revenue, 2),
                    "forecast_profit": round(profit, 2),
                }
            )

        return forecasts

    # --------------------------------------------------
    # RETENTION IMPACT
    # --------------------------------------------------
    def _get_retention_adjustment(self) -> Dict[str, Any]:
        retention_df = pd.DataFrame(get_retention_data())

        if retention_df.empty:
            return {
                "available": False,
                "message": "No retention data available",
            }

        avg_churn = float(retention_df["churn_probability"].mean())
        avg_retention = 1 - avg_churn
        multiplier = 1 + (avg_retention * 0.25)

        return {
            "available": True,
            "average_churn_probability": round(avg_churn, 3),
            "average_retention": round(avg_retention, 3),
            "future_revenue_multiplier": round(multiplier, 3),
        }

    # --------------------------------------------------
    # TOP FEATURE DRIVERS
    # --------------------------------------------------
    def _top_drivers(self) -> List[Dict[str, Any]]:
        if self.pipeline is None:
            return []

        model = self.pipeline.named_steps["model"]
        importances = model.feature_importances_

        pairs = sorted(
            zip(self.feature_names, importances),
            key=lambda x: x[1],
            reverse=True,
        )[:5]

        return [
            {
                "feature": feature,
                "importance": round(float(score), 4),
            }
            for feature, score in pairs
        ]

    # --------------------------------------------------
    # DATA PREP
    # --------------------------------------------------
    def _prepare_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()

        df["date"] = pd.to_datetime(df["date"])
        df["month"] = df["date"].dt.month
        df["quarter"] = df["date"].dt.quarter
        df["is_weekend"] = (df["date"].dt.dayofweek >= 5).astype(int)

        for column in FEATURE_COLUMNS:
            if column not in df.columns:
                df[column] = 0

        return df.fillna(0)
