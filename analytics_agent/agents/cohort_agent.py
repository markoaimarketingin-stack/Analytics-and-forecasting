from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from analytics_agent.state import AnalyticsState, CohortAnalysis


@dataclass
class CohortRequest:
    retention_months: int = 3


class CohortAgent:
    """Evaluates retention quality, churn risk, and customer-value segments."""

    def analyze(
        self,
        state: AnalyticsState,
        request: CohortRequest | None = None,
    ) -> AnalyticsState:
        request = request or CohortRequest()

        customers_df = pd.DataFrame(state.customer_data or state.customers_data or [])
        transactions_df = pd.DataFrame(state.transactions_data or [])
        retention_df = pd.DataFrame(state.retention_data or [])

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

        state.cohort_analysis = CohortAnalysis(
            average_ltv=round(average_ltv, 2),
            three_month_retention=round(three_month_retention, 3),
            churn_risk=round(churn_risk, 3),
            high_value_segment=high_value_segment,
            high_churn_segment=high_churn_segment,
            repeat_purchase_rate=round(repeat_purchase_rate, 3),
        )
        return state

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

