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
    segment: str = "all"
    signup_channel: str = "all"
    contract_type: str = "all"
    signup_start_date: str | None = None
    signup_end_date: str | None = None
    min_tenure_months: int = 0
    churn_probability_min: float = 0.0
    top_n: int = 8


class CohortAgent:
    """Supabase-first cohort analytics for retention, churn and value diagnostics."""

    def analyze(
        self,
        state: AnalyticsState,
        request: CohortRequest | None = None,
    ) -> AnalyticsState:
        request = self._build_request(state, request)

        customers_df, transactions_df, retention_df, source_info = self._load_dataframes(state)

        if customers_df.empty or retention_df.empty:
            state.cohort_analysis = CohortAnalysis(
                diagnostics={
                    "source_info": source_info,
                    "reason": "customers or retention data is missing in Supabase",
                    "data_points": {
                        "customer_rows": int(len(customers_df.index)),
                        "transaction_rows": int(len(transactions_df.index)),
                        "retention_rows": int(len(retention_df.index)),
                    },
                },
                filters_applied=self._filters_payload(request),
                data_source="supabase",
            )
            return state

        customers_df = self._prepare_customers(customers_df)
        transactions_df = self._prepare_transactions(transactions_df)
        retention_df = self._prepare_retention(retention_df)

        filtered_customers = self._apply_customer_filters(customers_df, request)
        if filtered_customers.empty:
            state.cohort_analysis = CohortAnalysis(
                diagnostics={
                    "source_info": source_info,
                    "reason": "No customers matched selected filters",
                    "filters_applied": self._filters_payload(request),
                },
                filters_applied=self._filters_payload(request),
                data_source="supabase",
            )
            return state

        scoped_ids = set(filtered_customers["customer_id"].astype(str))
        filtered_retention = retention_df[retention_df["customer_id"].astype(str).isin(scoped_ids)].copy()
        filtered_transactions = transactions_df[transactions_df["customer_id"].astype(str).isin(scoped_ids)].copy()

        if request.min_tenure_months > 0 and "tenure_months" in filtered_retention.columns:
            filtered_retention = filtered_retention[filtered_retention["tenure_months"] >= request.min_tenure_months]

        if request.churn_probability_min > 0 and "churn_probability" in filtered_retention.columns:
            filtered_retention = filtered_retention[filtered_retention["churn_probability"] >= request.churn_probability_min]

        scoped_ids = set(filtered_retention["customer_id"].astype(str))
        filtered_customers = filtered_customers[filtered_customers["customer_id"].astype(str).isin(scoped_ids)].copy()
        filtered_transactions = filtered_transactions[filtered_transactions["customer_id"].astype(str).isin(scoped_ids)].copy()

        if filtered_customers.empty or filtered_retention.empty:
            state.cohort_analysis = CohortAnalysis(
                diagnostics={
                    "source_info": source_info,
                    "reason": "No rows remaining after retention filters",
                    "filters_applied": self._filters_payload(request),
                },
                filters_applied=self._filters_payload(request),
                data_source="supabase",
            )
            return state

        profile = self._build_customer_profile(filtered_customers, filtered_retention, filtered_transactions)

        average_ltv = float(profile["customer_revenue"].mean()) if not profile.empty else 0.0
        repeat_purchase_rate = float(profile["is_repeat"].mean()) if not profile.empty else 0.0
        retention_curve = self._retention_curve(filtered_retention)
        three_month_retention = self._retention_rate_from_curve(retention_curve, request.retention_months)
        churn_risk = 1.0 - three_month_retention if three_month_retention > 0 else self._safe_mean(filtered_retention, "churn_probability")

        segment_breakdown = self._segment_breakdown(profile)
        signup_channel_value = self._signup_channel_value(profile)
        cohort_curves = self._cohort_curves(profile, request)
        cohort_table = self._cohort_table(profile, request)
        churn_risk_actions = self._churn_risk_actions(profile, request.top_n)

        high_value_segment = segment_breakdown[0]["segment"] if segment_breakdown else ""
        high_churn_segment = (
            sorted(segment_breakdown, key=lambda item: item.get("churn_risk", 0.0), reverse=True)[0]["segment"]
            if segment_breakdown
            else ""
        )

        diagnostics = {
            "data_points": {
                "customer_rows": int(len(filtered_customers.index)),
                "transaction_rows": int(len(filtered_transactions.index)),
                "retention_rows": int(len(filtered_retention.index)),
                "cohort_rows": int(len(cohort_table)),
            },
            "source_info": source_info,
            "retention_months": int(request.retention_months),
            "cohort_period": request.cohort_period,
            "filters_applied": self._filters_payload(request),
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
        analysis.cohort_curves = cohort_curves
        analysis.cohort_table = cohort_table
        analysis.churn_risk_actions = churn_risk_actions
        analysis.filters_applied = self._filters_payload(request)
        analysis.diagnostics = diagnostics
        analysis.data_source = "supabase"

        state.cohort_analysis = analysis
        return state

    def _build_request(self, state: AnalyticsState, request: CohortRequest | None) -> CohortRequest:
        if request:
            return request

        user_request = state.user_request or {}
        return CohortRequest(
            retention_months=int(user_request.get("retention_months", 3) or 3),
            cohort_period=str(user_request.get("cohort_period", "month") or "month"),
            segment=str(user_request.get("segment", "all") or "all"),
            signup_channel=str(user_request.get("signup_channel", "all") or "all"),
            contract_type=str(user_request.get("contract_type", "all") or "all"),
            signup_start_date=user_request.get("signup_start_date"),
            signup_end_date=user_request.get("signup_end_date"),
            min_tenure_months=int(user_request.get("min_tenure_months", 0) or 0),
            churn_probability_min=float(user_request.get("churn_probability_min", 0.0) or 0.0),
            top_n=max(3, int(user_request.get("top_n", 8) or 8)),
        )

    def _load_dataframes(
        self,
        state: AnalyticsState,
    ) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict[str, str]]:
        client_id = str((state.user_request or {}).get("client_id") or "").strip() or None
        customers_remote, customers_source = queries.get_dataset_dataframe_with_source(
            "customers",
            prefer_remote=not client_id,
            client_id=client_id,
        )
        transactions_remote, transactions_source = queries.get_dataset_dataframe_with_source(
            "transactions",
            prefer_remote=not client_id,
            client_id=client_id,
        )
        retention_remote, retention_source = queries.get_dataset_dataframe_with_source(
            "retention",
            prefer_remote=not client_id,
            client_id=client_id,
        )
        customers_df = customers_remote
        transactions_df = transactions_remote
        retention_df = retention_remote

        return customers_df, transactions_df, retention_df, {
            "customers": customers_source,
            "transactions": transactions_source,
            "retention": retention_source,
        }

    def _prepare_customers(self, customers_df: pd.DataFrame) -> pd.DataFrame:
        out = customers_df.copy()
        if "customer_id" not in out.columns:
            out["customer_id"] = ""
        if "signup_date" in out.columns:
            out["signup_date"] = pd.to_datetime(out["signup_date"], errors="coerce")
        for column in ["segment", "signup_channel", "contract_type"]:
            if column not in out.columns:
                out[column] = "Unknown"
            out[column] = out[column].fillna("Unknown").astype(str)
        return out

    def _prepare_retention(self, retention_df: pd.DataFrame) -> pd.DataFrame:
        out = retention_df.copy()
        if "customer_id" not in out.columns:
            out["customer_id"] = ""
        for column in ["tenure_months", "monthly_logins", "churn_probability"]:
            if column not in out.columns:
                out[column] = 0
            out[column] = pd.to_numeric(out[column], errors="coerce").fillna(0)
        if "churned" not in out.columns:
            out["churned"] = False
        out["churned"] = out["churned"].fillna(False).astype(bool)
        out["active_probability"] = 1.0 - out["churn_probability"].clip(lower=0.0, upper=1.0)
        out.loc[out["churned"], "active_probability"] = 0.0
        return out

    def _prepare_transactions(self, transactions_df: pd.DataFrame) -> pd.DataFrame:
        if transactions_df.empty:
            return pd.DataFrame(columns=["customer_id", "revenue", "order_number", "is_repeat_purchase", "purchase_date"])

        out = transactions_df.copy()
        if "customer_id" not in out.columns:
            out["customer_id"] = ""
        if "revenue" not in out.columns:
            out["revenue"] = 0.0
        out["revenue"] = pd.to_numeric(out["revenue"], errors="coerce").fillna(0.0)
        if "order_number" not in out.columns:
            out["order_number"] = 1
        if "is_repeat_purchase" not in out.columns:
            out["is_repeat_purchase"] = False
        if "purchase_date" in out.columns:
            out["purchase_date"] = pd.to_datetime(out["purchase_date"], errors="coerce")
        return out

    def _apply_customer_filters(self, customers_df: pd.DataFrame, request: CohortRequest) -> pd.DataFrame:
        filtered = customers_df.copy()

        if request.segment and request.segment.lower() != "all" and "segment" in filtered.columns:
            filtered = filtered[filtered["segment"].astype(str) == request.segment]

        if request.signup_channel and request.signup_channel.lower() != "all" and "signup_channel" in filtered.columns:
            filtered = filtered[filtered["signup_channel"].astype(str) == request.signup_channel]

        if request.contract_type and request.contract_type.lower() != "all" and "contract_type" in filtered.columns:
            filtered = filtered[filtered["contract_type"].astype(str) == request.contract_type]

        if request.signup_start_date and "signup_date" in filtered.columns:
            start_dt = pd.to_datetime(request.signup_start_date, errors="coerce")
            if not pd.isna(start_dt):
                filtered = filtered[filtered["signup_date"] >= start_dt]

        if request.signup_end_date and "signup_date" in filtered.columns:
            end_dt = pd.to_datetime(request.signup_end_date, errors="coerce")
            if not pd.isna(end_dt):
                filtered = filtered[filtered["signup_date"] <= end_dt]

        return filtered

    def _build_customer_profile(
        self,
        customers_df: pd.DataFrame,
        retention_df: pd.DataFrame,
        transactions_df: pd.DataFrame,
    ) -> pd.DataFrame:
        revenue_per_customer = (
            transactions_df.groupby("customer_id")["revenue"]
            .sum()
            .reset_index()
            .rename(columns={"revenue": "customer_revenue"})
            if not transactions_df.empty
            else pd.DataFrame(columns=["customer_id", "customer_revenue"])
        )
        order_counts = (
            transactions_df.groupby("customer_id")
            .size()
            .reset_index(name="orders")
            if not transactions_df.empty
            else pd.DataFrame(columns=["customer_id", "orders"])
        )

        profile = customers_df.merge(retention_df, on="customer_id", how="left")
        profile = profile.merge(revenue_per_customer, on="customer_id", how="left")
        profile = profile.merge(order_counts, on="customer_id", how="left")
        profile["customer_revenue"] = pd.to_numeric(profile.get("customer_revenue"), errors="coerce").fillna(0.0)
        profile["orders"] = pd.to_numeric(profile.get("orders"), errors="coerce").fillna(0)
        profile["is_repeat"] = profile["orders"].gt(1).astype(float)
        return profile

    def _segment_breakdown(self, profile: pd.DataFrame) -> list[dict[str, Any]]:
        if profile.empty or "segment" not in profile.columns:
            return []

        grouped = (
            profile.groupby("segment", dropna=False)
            .agg(
                customers=("customer_id", "nunique"),
                average_ltv=("customer_revenue", "mean"),
                repeat_purchase_rate=("is_repeat", "mean"),
                churn_risk=("churn_probability", "mean"),
            )
            .reset_index()
        )

        out: list[dict[str, Any]] = []
        for _, row in grouped.iterrows():
            out.append(
                {
                    "segment": str(row.get("segment", "Unknown")),
                    "customers": int(row.get("customers", 0)),
                    "average_ltv": round(float(row.get("average_ltv", 0.0)), 2),
                    "repeat_purchase_rate": round(float(row.get("repeat_purchase_rate", 0.0)), 4),
                    "churn_risk": round(float(row.get("churn_risk", 0.0)), 4),
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
                    "avg_monthly_logins": round(float(pd.to_numeric(grp.get("monthly_logins", 0), errors="coerce").fillna(0.0).mean()), 2),
                }
            )

        out.sort(key=lambda item: item["tenure_months"])
        return out

    def _signup_channel_value(self, profile: pd.DataFrame) -> list[dict[str, Any]]:
        if profile.empty or "signup_channel" not in profile.columns or "customer_id" not in profile.columns:
            return []

        grouped = (
            profile.groupby("signup_channel", dropna=False)
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

    def _cohort_period_labels(self, signup_dates: pd.Series, cohort_period: str) -> pd.Series:
        period = (cohort_period or "month").strip().lower()
        parsed = pd.to_datetime(signup_dates, errors="coerce")
        if period == "week":
            return parsed.dt.to_period("W").astype(str)
        if period == "quarter":
            return parsed.dt.to_period("Q").astype(str)
        return parsed.dt.to_period("M").astype(str)

    def _cohort_curves(self, profile: pd.DataFrame, request: CohortRequest) -> list[dict[str, Any]]:
        if profile.empty or "signup_date" not in profile.columns:
            return []

        df = profile.copy()
        df["cohort_label"] = self._cohort_period_labels(df["signup_date"], request.cohort_period)
        df = df[df["cohort_label"].astype(str) != "NaT"]
        if df.empty:
            return []

        grouped = (
            df.groupby("cohort_label", dropna=False)
            .agg(
                customers=("customer_id", "nunique"),
                avg_tenure_months=("tenure_months", "mean"),
                retention_rate=("active_probability", "mean"),
                churn_probability=("churn_probability", "mean"),
                avg_revenue_per_customer=("customer_revenue", "mean"),
            )
            .reset_index()
            .sort_values("cohort_label")
        )

        return [
            {
                "cohort_label": str(row.get("cohort_label", "Unknown")),
                "customers": int(row.get("customers", 0)),
                "avg_tenure_months": round(float(row.get("avg_tenure_months", 0.0)), 2),
                "retention_rate": round(float(row.get("retention_rate", 0.0)), 4),
                "churn_probability": round(float(row.get("churn_probability", 0.0)), 4),
                "avg_revenue_per_customer": round(float(row.get("avg_revenue_per_customer", 0.0)), 2),
            }
            for _, row in grouped.iterrows()
        ]

    def _cohort_table(self, profile: pd.DataFrame, request: CohortRequest) -> list[dict[str, Any]]:
        if profile.empty or "signup_date" not in profile.columns:
            return []

        df = profile.copy()
        df["cohort_label"] = self._cohort_period_labels(df["signup_date"], request.cohort_period)
        df = df[df["cohort_label"].astype(str) != "NaT"]
        if df.empty:
            return []

        grouped = (
            df.groupby(["cohort_label", "tenure_months"], dropna=False)
            .agg(
                customers=("customer_id", "nunique"),
                retention_rate=("active_probability", "mean"),
                churn_probability=("churn_probability", "mean"),
                avg_revenue_per_customer=("customer_revenue", "mean"),
                avg_monthly_logins=("monthly_logins", "mean"),
            )
            .reset_index()
            .sort_values(["cohort_label", "tenure_months"])
        )

        out = [
            {
                "cohort_label": str(row.get("cohort_label", "Unknown")),
                "tenure_months": int(row.get("tenure_months", 0) or 0),
                "customers": int(row.get("customers", 0)),
                "retention_rate": round(float(row.get("retention_rate", 0.0)), 4),
                "churn_probability": round(float(row.get("churn_probability", 0.0)), 4),
                "avg_revenue_per_customer": round(float(row.get("avg_revenue_per_customer", 0.0)), 2),
                "avg_monthly_logins": round(float(row.get("avg_monthly_logins", 0.0)), 2),
            }
            for _, row in grouped.iterrows()
        ]
        return out[:400]

    def _retention_rate_from_curve(self, curve: list[dict[str, Any]], retention_months: int) -> float:
        if not curve:
            return 0.0

        scoped = [item for item in curve if int(item.get("tenure_months", 0)) >= int(retention_months)]
        if not scoped:
            scoped = curve

        weights = [max(1, int(item.get("customers", 0))) for item in scoped]
        values = [float(item.get("retention_rate", 0.0)) for item in scoped]
        total_weight = float(sum(weights))
        if total_weight <= 0:
            return 0.0
        return float(sum(value * weight for value, weight in zip(values, weights)) / total_weight)

    def _churn_risk_actions(self, profile: pd.DataFrame, top_n: int) -> list[dict[str, Any]]:
        if profile.empty:
            return []

        grouped = (
            profile.groupby(["segment", "signup_channel", "contract_type"], dropna=False)
            .agg(
                customers=("customer_id", "nunique"),
                churn_risk=("churn_probability", "mean"),
                avg_ltv=("customer_revenue", "mean"),
            )
            .reset_index()
            .sort_values(["churn_risk", "customers"], ascending=[False, False])
        )

        actions: list[dict[str, Any]] = []
        for _, row in grouped.head(max(3, top_n)).iterrows():
            churn_risk = float(row.get("churn_risk", 0.0))
            expected_retention_lift = min(0.12, max(0.01, churn_risk * 0.25))
            priority = "high" if churn_risk >= 0.55 else "medium" if churn_risk >= 0.35 else "low"
            actions.append(
                {
                    "priority": priority,
                    "segment": str(row.get("segment", "Unknown")),
                    "signup_channel": str(row.get("signup_channel", "Unknown")),
                    "contract_type": str(row.get("contract_type", "Unknown")),
                    "customers": int(row.get("customers", 0)),
                    "avg_ltv": round(float(row.get("avg_ltv", 0.0)), 2),
                    "churn_risk": round(churn_risk, 4),
                    "recommended_action": (
                        f"Launch targeted save playbook for {row.get('segment', 'target segment')} acquired via "
                        f"{row.get('signup_channel', 'primary channel')} with {row.get('contract_type', 'current contract')} specific incentive."
                    ),
                    "expected_impact": f"+{expected_retention_lift * 100:.1f}% retention for this cohort cluster",
                }
            )

        return actions

    def _safe_mean(self, df: pd.DataFrame, column: str) -> float:
        if df.empty or column not in df.columns:
            return 0.0
        values = pd.to_numeric(df[column], errors="coerce").dropna()
        if values.empty:
            return 0.0
        return float(values.mean())

    def _filters_payload(self, request: CohortRequest) -> dict[str, Any]:
        return {
            "cohort_period": request.cohort_period,
            "retention_months": request.retention_months,
            "segment": request.segment,
            "signup_channel": request.signup_channel,
            "contract_type": request.contract_type,
            "signup_start_date": request.signup_start_date,
            "signup_end_date": request.signup_end_date,
            "min_tenure_months": request.min_tenure_months,
            "churn_probability_min": request.churn_probability_min,
            "top_n": request.top_n,
        }

