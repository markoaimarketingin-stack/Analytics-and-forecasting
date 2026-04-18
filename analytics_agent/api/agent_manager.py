
from datetime import datetime
from typing import Any, Dict, List

from analytics_agent.logging_config import get_logger
from analytics_agent.agents.orchestrator_agent import (
    OrchestratorAgent,
    OrchestratorRequest,
)

logger = get_logger(__name__)


class AgentManager:
    """
    Backward-compatible orchestration layer.

    Existing AnalyticsSupervisor can continue calling:
        self.agent_manager.orchestrate(...)

    Internally this now delegates to the new OrchestratorAgent,
    which runs:
        Attribution -> Funnel -> Cohort -> Forecast -> Scenario

    while preserving the old response shape expected by the frontend.
    """

    def __init__(self) -> None:
        self.orchestrator = OrchestratorAgent()

        # Preserve old behavior for history / discussion panel
        self.agent_results: Dict[str, Dict[str, Any]] = {}
        self.execution_history: List[Dict[str, Any]] = []

    # ============================================================
    # MAIN ENTRY POINT
    # ============================================================
    def orchestrate(
        self,
        intent: str,
        agents_to_run: List[str],
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        start_time = datetime.utcnow()

        logger.info(
            "AgentManager orchestration started",
            intent=intent,
            agents=agents_to_run,
        )

        try:
            request = OrchestratorRequest(
                user_request={
                    "intent": intent,
                    "channel": payload.get("channel"),
                    "campaign_type": payload.get("campaign_type"),
                    "spend": payload.get("spend"),
                    "impressions": payload.get("impressions"),
                    "ctr": payload.get("ctr"),
                    "conversion_rate": payload.get("conversion_rate"),
                    "horizon_days": payload.get("horizon_days", 30),
                    "kpi_metric": payload.get("kpi_metric", "revenue"),
                    "campaign_id": payload.get("campaign_id", "all"),
                    "base_spend": payload.get("base_spend"),
                    "spend_change_pct": payload.get("spend_change_pct", 0),
                    "ctr_lift_pct": payload.get("ctr_lift_pct", 0),
                    "conversion_lift_pct": payload.get("conversion_lift_pct", 0),
                    "cpc_change_pct": payload.get("cpc_change_pct", 0),
                    "aov_change_pct": payload.get("aov_change_pct", 0),
                    "seasonality_factor": payload.get("seasonality_factor", 1.0),
                    "base_spend_change_pct": payload.get("base_spend_change_pct", 0),
                    "base_ctr_lift_pct": payload.get("base_ctr_lift_pct", 0),
                    "base_conversion_lift_pct": payload.get("base_conversion_lift_pct", 0),
                    "base_aov_change_pct": payload.get("base_aov_change_pct", 0),
                    "adjustments": payload.get("adjustments", {}),
                    "attribution_model": payload.get("attribution_model", "linear"),
                    "metric": payload.get("metric", "revenue"),
                    "time_period": payload.get("time_period", "month"),
                    "cohort_period": payload.get("cohort_period", "month"),
                    "retention_months": payload.get("retention_months", 3),
                    "signup_channel": payload.get("signup_channel", "all"),
                    "contract_type": payload.get("contract_type", "all"),
                    "signup_start_date": payload.get("signup_start_date"),
                    "signup_end_date": payload.get("signup_end_date"),
                    "min_tenure_months": payload.get("min_tenure_months", 0),
                    "churn_probability_min": payload.get("churn_probability_min", 0),
                    "top_n": payload.get("top_n", 8),
                    "budget_shift_cap_percent": payload.get("budget_shift_cap_percent", 20),
                    "funnel_type": payload.get("funnel_type"),
                    "segment": payload.get("segment"),
                    "event_type": payload.get("event_type"),
                    "improvement_capture_rate": payload.get("improvement_capture_rate", 0.2),
                    "total_budget": payload.get("total_budget", 0),
                    "objective": payload.get("objective", "profit"),
                    "risk_tolerance": payload.get("risk_tolerance", "balanced"),
                    "max_shift_pct": payload.get("max_shift_pct", 20),
                    "min_channel_pct": payload.get("min_channel_pct", 5),
                    "max_channel_pct": payload.get("max_channel_pct", 60),
                    "client_id": payload.get("client_id"),
                },
                run_agents=agents_to_run,
            )

            state = self.orchestrator.run(request)

            result = {
                "success": True,
                "intent": intent,
                "agents_executed": agents_to_run,
                "agent_results": {
                    "attribution": self._serialize(
                        state.attribution_analysis
                    ),
                    "funnel": self._serialize(
                        state.funnel_analysis
                    ),
                    "cohort": self._serialize(
                        state.cohort_analysis
                    ),
                    "forecast": self._serialize(
                        state.forecast_analysis
                    ),
                    "scenario": self._serialize(
                        state.scenario_analysis
                    ),
                    "budget_allocator": self._serialize(
                        state.budget_allocation_analysis
                    ),
                },
                # New flattened fields used by AnalyticsSupervisor
                "attribution_analysis": self._serialize(
                    state.attribution_analysis
                ),
                "funnel_analysis": self._serialize(
                    state.funnel_analysis
                ),
                "cohort_analysis": self._serialize(
                    state.cohort_analysis
                ),
                "forecast_analysis": self._serialize(
                    state.forecast_analysis
                ),
                "scenario_analysis": self._serialize(
                    state.scenario_analysis
                ),
                "budget_allocation_analysis": self._serialize(
                    state.budget_allocation_analysis
                ),
                "recommendations": state.recommendations,
                "executive_summary": state.executive_summary,
                "confidence_score": (
                    getattr(state.forecast_analysis, "confidence", None)
                    if state.forecast_analysis
                    else None
                ),
                "warnings": [],
                "suggestions": state.recommendations,
                "timestamp": datetime.utcnow().isoformat(),
            }

            duration_ms = (
                datetime.utcnow() - start_time
            ).total_seconds() * 1000

            result["duration_ms"] = round(duration_ms, 2)

            # Store per-agent result history for later review
            self.agent_results = {
                "attribution": result.get("attribution_analysis") or {},
                "funnel": result.get("funnel_analysis") or {},
                "cohort": result.get("cohort_analysis") or {},
                "forecast": result.get("forecast_analysis") or {},
                "scenario": result.get("scenario_analysis") or {},
                "budget_allocator": result.get("budget_allocation_analysis") or {},
            }

            self.execution_history.append(
                {
                    "intent": intent,
                    "agents": agents_to_run,
                    "timestamp": result["timestamp"],
                    "duration_ms": result["duration_ms"],
                    "executive_summary": state.executive_summary,
                }
            )

            logger.info(
                "AgentManager orchestration completed",
                intent=intent,
                duration_ms=result["duration_ms"],
            )

            return result

        except Exception as exc:
            logger.exception(
                "AgentManager orchestration failed",
                error=str(exc),
            )

            return {
                "success": False,
                "intent": intent,
                "agents_executed": agents_to_run,
                "agent_results": {},
                "errors": {"system": str(exc)},
                "warnings": [str(exc)],
                "timestamp": datetime.utcnow().isoformat(),
            }

    # ============================================================
    # RESULT SERIALIZATION
    # ============================================================
    def _serialize(self, obj: Any) -> Dict[str, Any] | None:
        if obj is None:
            return None

        if hasattr(obj, "to_dict"):
            return obj.to_dict()

        if hasattr(obj, "dict"):
            return obj.dict()

        if hasattr(obj, "__dict__"):
            return {
                key: value
                for key, value in obj.__dict__.items()
                if not key.startswith("_")
            }

        return obj

    # ============================================================
    # LEGACY ACCESSORS (kept for frontend compatibility)
    # ============================================================
    def get_agent_results(self, agent_id: str | None = None) -> Dict[str, Any]:
        if agent_id:
            return self.agent_results.get(agent_id, {})
        return self.agent_results

    def get_execution_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        return self.execution_history[-limit:]

    def get_agent_status(self) -> Dict[str, Dict[str, Any]]:
        return {
            "attribution": {
                "status": "ready",
                "last_execution": self.agent_results.get("attribution", {}),
            },
            "funnel": {
                "status": "ready",
                "last_execution": self.agent_results.get("funnel", {}),
            },
            "cohort": {
                "status": "ready",
                "last_execution": self.agent_results.get("cohort", {}),
            },
            "forecast": {
                "status": "ready",
                "model_loaded": bool(
                    getattr(self.orchestrator.forecast_agent, "pipeline", None)
                    or getattr(self.orchestrator.forecast_agent, "model", None)
                ),
                "last_execution": self.agent_results.get("forecast", {}),
            },
            "scenario": {
                "status": "ready",
                "last_execution": self.agent_results.get("scenario", {}),
            },
            "budget_allocator": {
                "status": "ready",
                "last_execution": self.agent_results.get("budget_allocator", {}),
            },
        }

    # ============================================================
    # TRAIN FORECAST MODEL
    # ============================================================
    def train_forecast_agent(self) -> Dict[str, Any]:
        logger.info("Training forecast model via AgentManager")
        return self.orchestrator.forecast_agent.train()

    # ============================================================
    # CLEAR STORED RESULTS
    # ============================================================
    def clear_results(self, agent_id: str | None = None) -> None:
        if agent_id:
            self.agent_results.pop(agent_id, None)
        else:
            self.agent_results.clear()
            self.execution_history.clear()
