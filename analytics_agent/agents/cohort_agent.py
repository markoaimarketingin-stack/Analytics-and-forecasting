from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd

from analytics_agent.db import queries
from analytics_agent.state import AnalyticsState, CohortAnalysis


@dataclass
class CohortRequest:
    retention_months: int = 3
    cohort_period: str = "month"


class CohortAgent:
    """Evaluates retention quality, churn risk, and customer-value segments."""

    def analyze(
        self,
        state: AnalyticsState,
        request: CohortRequest | None = None,
    ) -> AnalyticsState:
        request = self._build_request(state, request)

        customers_df, transactions_df, retention_df, source_info = self._load_dataframes(state)

        if customers_df.empty:
            state.cohort_analysis = CohortAnalysis()
            return state

        revenue_per_customer = self._revenue_by_customer(transactions_df)
        cohort_df = customers_df.merge(revenue_per_customer, on="customer_id", how="left")
        cohort_df["customer_revenue"] = cohort_df["customer_revenue"].fillna(0.0)

        average_ltv = float(cohort_df["customer_revenue"].mean()) if not cohort_df.empty else 0.0
        repeat_purchase_rate = self._repeat_purchase_rate(transactions_df)
        three_month_retention = self._retention_rate(retention_df, request.retention_months)
        churn_risk = self._churn_risk(retention_df)
        high_value_segment = self._highest_value_segment(cohort_df)
        high_churn_segment = self._highest_churn_segment(customers_df, retention_df)

        segment_breakdown = self._segment_breakdown(cohort_df, retention_df)
        retention_curve = self._retention_curve(retention_df)
        signup_channel_value = self._signup_channel_value(customers_df, revenue_per_customer)

        diagnostics = {
            "data_points": {
                "customer_rows": int(len(customers_df.index)),
                "transaction_rows": int(len(transactions_df.index)),
                "retention_rows": int(len(retention_df.index)),
            },
            "source_info": source_info,
            "retention_months": int(request.retention_months),
            "cohort_period": request.cohort_period,
        }

        analysis = CohortAnalysis(
            average_ltv=round(average_ltv, 2),
            three_month_retention=round(three_month_retention, 3),
            churn_risk=round(churn_risk, 3),
            high_value_segment=high_value_segment,
            high_churn_segment=high_churn_segment,
            repeat_purchase_rate=round(repeat_purchase_rate, 3),
        )
        analysis.segment_breakdown = segment_breakdown
        analysis.retention_curve = retention_curve
        analysis.signup_channel_value = signup_channel_value
        analysis.diagnostics = diagnostics
        analysis.data_source = "supabase" if any(source == "supabase" for source in source_info.values()) else "local"

        state.cohort_analysis = analysis
        return state

    def _build_request(self, state: AnalyticsState, request: CohortRequest | None) -> CohortRequest:
        if request:
            return request

        user_request = state.user_request or {}
        return CohortRequest(
            retention_months=int(user_request.get("retention_months", 3) or 3),
            cohort_period=str(user_request.get("cohort_period", "month") or "month"),
        )

    def _load_dataframes(
        self,
        state: AnalyticsState,
    ) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict[str, str]]:
        customers_remote, customers_source = queries.get_dataset_dataframe_with_source(
            "customers",
            prefer_remote=True,
        )
        transactions_remote, transactions_source = queries.get_dataset_dataframe_with_source(
            "transactions",
            prefer_remote=True,
        )
        retention_remote, retention_source = queries.get_dataset_dataframe_with_source(
            "retention",
            prefer_remote=True,
        )

        customer_records = state.customer_data or state.customers_data or []
        customers_df = customers_remote if not customers_remote.empty else pd.DataFrame(customer_records)
        transactions_df = transactions_remote if not transactions_remote.empty else pd.DataFrame(state.transactions_data or [])
        retention_df = retention_remote if not retention_remote.empty else pd.DataFrame(state.retention_data or [])

        return customers_df, transactions_df, retention_df, {
            "customers": customers_source,
            "transactions": transactions_source,
            "retention": retention_source,
        }

    def _revenue_by_customer(self, transactions_df: pd.DataFrame) -> pd.DataFrame:
        if transactions_df.empty or "customer_id" not in transactions_df.columns:
            return pd.DataFrame(columns=["customer_id", "customer_revenue"])

        if "revenue" not in transactions_df.columns:
            transactions_df = transactions_df.copy()
            transactions_df["revenue"] = 0.0

        return (
            transactions_df.groupby("customer_id")["revenue"]
            .sum()
            .reset_index()
            .rename(columns={"revenue": "customer_revenue"})
        )

    def _segment_breakdown(self, cohort_df: pd.DataFrame, retention_df: pd.DataFrame) -> list[dict[str, Any]]:
        if cohort_df.empty or "segment" not in cohort_df.columns:
            return []

        grouped = (
            cohort_df.groupby("segment", dropna=False)
            .agg(
                customers=("segment", "size"),
                average_ltv=("customer_revenue", "mean"),
            )
            .reset_index()
        )

        churn_by_customer = pd.DataFrame()
        if not retention_df.empty and {"customer_id", "churn_probability"}.issubset(set(retention_df.columns)):
            churn_by_customer = (
                retention_df.groupby("customer_id")["churn_probability"]
                .mean()
                .reset_index()
            )

        out: list[dict[str, Any]] = []
        for _, row in grouped.iterrows():
            segment = str(row.get("segment", "Unknown"))
            segment_customers = cohort_df[cohort_df["segment"].astype(str) == segment]

            repeat_rate = 0.0
            if "customer_revenue" in segment_customers.columns:
                repeat_rate = float(segment_customers["customer_revenue"].gt(0).mean())

            churn_risk = 0.0
            if not churn_by_customer.empty and "customer_id" in segment_customers.columns:
                merged = segment_customers[["customer_id"]].merge(churn_by_customer, on="customer_id", how="left")
                churn_vals = pd.to_numeric(merged["churn_probability"], errors="coerce").dropna()
                churn_risk = float(churn_vals.mean()) if not churn_vals.empty else 0.0

            out.append(
                {
                    "segment": segment,
                    "customers": int(row.get("customers", 0)),
                    "average_ltv": round(float(row.get("average_ltv", 0.0)), 2),
                    "repeat_purchase_rate": round(repeat_rate, 4),
                    "churn_risk": round(churn_risk, 4),
                }
            )

        out.sort(key=lambda item: item.get("average_ltv", 0.0), reverse=True)
        return out

    def _retention_curve(self, retention_df: pd.DataFrame) -> list[dict[str, Any]]:
        if retention_df.empty or "tenure_months" not in retention_df.columns:
            return []

        df = retention_df.copy()
        df["tenure_months"] = pd.to_numeric(df["tenure_months"], errors="coerce")
        df = df.dropna(subset=["tenure_months"])
        if df.empty:
            return []

        grouped = df.groupby("tenure_months", dropna=False)
        out: list[dict[str, Any]] = []
        for tenure, grp in grouped:
            if "churned" in grp.columns:
                churn_rate = float(pd.to_numeric(grp["churned"], errors="coerce").fillna(0).mean())
            elif "churn_probability" in grp.columns:
                churn_rate = float(pd.to_numeric(grp["churn_probability"], errors="coerce").fillna(0).mean())
            else:
                churn_rate = 0.0

            retention_rate = max(0.0, 1.0 - churn_rate)
            tenure_int = int(pd.to_numeric(tenure, errors="coerce") or 0)

            out.append(
                {
                    "tenure_months": tenure_int,
                    "retention_rate": round(retention_rate, 4),
                    "churn_rate": round(churn_rate, 4),
                    "customers": int(len(grp.index)),
                }
            )

        out.sort(key=lambda item: item["tenure_months"])
        return out

    def _signup_channel_value(
        self,
        customers_df: pd.DataFrame,
        revenue_per_customer: pd.DataFrame,
    ) -> list[dict[str, Any]]:
        if customers_df.empty or "signup_channel" not in customers_df.columns or "customer_id" not in customers_df.columns:
            return []

        merged = customers_df.merge(revenue_per_customer, on="customer_id", how="left")
        merged["customer_revenue"] = pd.to_numeric(merged.get("customer_revenue"), errors="coerce").fillna(0.0)

        grouped = (
            merged.groupby("signup_channel", dropna=False)
            .agg(
                customers=("customer_id", "nunique"),
                revenue=("customer_revenue", "sum"),
            )
            .reset_index()
        )

        out: list[dict[str, Any]] = []
        for _, row in grouped.iterrows():
            customers = int(row.get("customers", 0))
            revenue = float(row.get("revenue", 0.0))
            out.append(
                {
                    "signup_channel": str(row.get("signup_channel", "Unknown")),
                    "customers": customers,
                    "revenue": round(revenue, 2),
                    "average_ltv": round(revenue / customers, 2) if customers > 0 else 0.0,
                }
            )

        out.sort(key=lambda item: item.get("revenue", 0.0), reverse=True)
        return out

    def _repeat_purchase_rate(self, transactions_df: pd.DataFrame) -> float:
        if transactions_df.empty or "customer_id" not in transactions_df.columns:
            return 0.0

        if "is_repeat_purchase" in transactions_df.columns:
            repeaters = transactions_df.groupby("customer_id")["is_repeat_purchase"].max()
            return float(repeaters.mean())

        orders_per_customer = transactions_df.groupby("customer_id").size()
        return float(orders_per_customer.gt(1).astype(float).mean())

    def _retention_rate(self, retention_df: pd.DataFrame, retention_months: int) -> float:
        if retention_df.empty:
            return 0.0

        scoped = retention_df.copy()
        if "tenure_months" in scoped.columns:
            scoped = scoped[scoped["tenure_months"] >= retention_months]

        if scoped.empty:
            return 0.0

        if "churned" in scoped.columns:
            return float(1.0 - scoped["churned"].astype(float).mean())

        if "churn_probability" in scoped.columns:
            return float(1.0 - scoped["churn_probability"].astype(float).mean())

        return 0.0

    def _churn_risk(self, retention_df: pd.DataFrame) -> float:
        if retention_df.empty:
            return 0.0

        if "churn_probability" in retention_df.columns:
            return float(retention_df["churn_probability"].astype(float).mean())

        if "churned" in retention_df.columns:
            return float(retention_df["churned"].astype(float).mean())

        return 0.0

    def _highest_value_segment(self, cohort_df: pd.DataFrame) -> str:
        if cohort_df.empty or "segment" not in cohort_df.columns:
            return ""

        scores = cohort_df.groupby("segment")["customer_revenue"].mean()
        if scores.empty:
            return ""
        return str(scores.idxmax())

    def _highest_churn_segment(self, customers_df: pd.DataFrame, retention_df: pd.DataFrame) -> str:
        if customers_df.empty or retention_df.empty:
            return ""

        if "customer_id" not in customers_df.columns or "customer_id" not in retention_df.columns:
            return ""

        merged = customers_df.merge(retention_df, on="customer_id", how="inner")
        if merged.empty:
            return ""

        if "churn_probability" in merged.columns and "contract_type" in merged.columns:
            churn_scores = merged.groupby("contract_type")["churn_probability"].mean()
            if not churn_scores.empty:
                return f"{churn_scores.idxmax()} Users"

        if "churn_probability" in merged.columns and "segment" in merged.columns:
            churn_scores = merged.groupby("segment")["churn_probability"].mean()
            if not churn_scores.empty:
                return str(churn_scores.idxmax())

        return ""

