from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from analytics_agent.logging_config import get_logger
from analytics_agent.agents.forecast_agent import ForecastAgent, ForecastRequest
from analytics_agent.agents.cohort_agent import CohortAgent, CohortRequest
from analytics_agent.agents.attribution_agent import AttributionAgent, AttributionRequest
from analytics_agent.agents.funnel_agent import FunnelAgent, FunnelRequest
from analytics_agent.agents.scenario_agent import ScenarioAgent, ScenarioRequest

logger = get_logger(__name__)


class AgentManager:
    """
    Central orchestration layer managing all specialist analytics agents.
    
    Responsibilities:
    - Initialize and manage all agents (forecast, cohort, attribution, funnel, scenario)
    - Execute agents in parallel or sequence based on intent
    - Aggregate results from multiple agents
    - Store and retrieve agent results for discussion/review
    - Provide agent health and status information
    """
    
    def __init__(self):
        """Initialize all specialist agents"""
        self.forecast_agent = ForecastAgent()
        self.cohort_agent = CohortAgent()
        self.attribution_agent = AttributionAgent()
        self.funnel_agent = FunnelAgent()
        self.scenario_agent = ScenarioAgent()
        
        # Store results for later retrieval/discussion
        self.agent_results: Dict[str, Dict[str, Any]] = {}
        self.execution_history: List[Dict[str, Any]] = []
    
    # ============================================================
    # ORCHESTRATION ENTRY POINT
    # ============================================================
    def orchestrate(
        self,
        intent: str,
        agents_to_run: List[str],
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Orchestrate multiple agents based on intent.
        
        Args:
            intent: Analytics intent (forecast, scenario, funnel, attribution, cohort, dashboard, etc.)
            agents_to_run: List of agent IDs to execute
            payload: Request payload with parameters
            
        Returns:
            Aggregated results from all agents
        """
        start_time = datetime.utcnow()
        execution_log: Dict[str, Any] = {
            "intent": intent,
            "agents_requested": agents_to_run,
            "timestamp": start_time.isoformat(),
            "results": {},
            "errors": {},
        }
        
        logger.info(
            "Agent orchestration started",
            intent=intent,
            agents=agents_to_run,
        )
        
        # Execute each requested agent
        for agent_id in agents_to_run:
            try:
                logger.info(f"Executing {agent_id} agent")
                
                result = self._execute_agent(agent_id, payload)
                execution_log["results"][agent_id] = result
                self.agent_results[agent_id] = result
                
                logger.info(f"{agent_id} agent completed", result_keys=list(result.keys()) if isinstance(result, dict) else None)
                
            except NotImplementedError as e:
                logger.warning(
                    f"{agent_id} agent not yet implemented",
                    error=str(e),
                )
                execution_log["errors"][agent_id] = f"Agent not yet implemented: {str(e)}"
                execution_log["results"][agent_id] = {"status": "not_implemented", "message": str(e)}
                
            except Exception as e:
                logger.exception(
                    f"Error executing {agent_id} agent",
                    error=str(e),
                )
                execution_log["errors"][agent_id] = str(e)
                execution_log["results"][agent_id] = {"status": "error", "error": str(e)}
        
        # Store execution history
        execution_log["duration_ms"] = (
            (datetime.utcnow() - start_time).total_seconds() * 1000
        )
        self.execution_history.append(execution_log)
        
        return {
            "success": len(execution_log["errors"]) == 0,
            "intent": intent,
            "agents_executed": agents_to_run,
            "agent_results": execution_log["results"],
            "errors": execution_log["errors"] if execution_log["errors"] else None,
            "timestamp": datetime.utcnow().isoformat(),
            "duration_ms": execution_log["duration_ms"],
        }
    
    # ============================================================
    # AGENT EXECUTION DISPATCHER
    # ============================================================
    def _execute_agent(self, agent_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a specific agent with payload.
        
        Args:
            agent_id: Agent identifier
            payload: Request payload
            
        Returns:
            Agent results
        """
        if agent_id == "forecast":
            return self._run_forecast_agent(payload)
        elif agent_id == "cohort":
            return self._run_cohort_agent(payload)
        elif agent_id == "attribution":
            return self._run_attribution_agent(payload)
        elif agent_id == "funnel":
            return self._run_funnel_agent(payload)
        elif agent_id == "scenario":
            return self._run_scenario_agent(payload)
        else:
            raise ValueError(f"Unknown agent: {agent_id}")
    
    # ============================================================
    # FORECAST AGENT
    # ============================================================
    def _run_forecast_agent(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Execute forecast agent"""
        logger.info("Running forecast agent")
        
        # Extract parameters from payload
        channel = payload.get("channel", "Google Ads")
        campaign_type = payload.get("campaign_type", "Conversion")
        spend = payload.get("spend", 10000)
        impressions = payload.get("impressions", 50000)
        ctr = payload.get("ctr", 0.12)
        conversion_rate = payload.get("conversion_rate", 0.08)
        horizon_days = payload.get("horizon_days", 30)
        
        # Create forecast request
        request = ForecastRequest(
            channel=channel,
            campaign_type=campaign_type,
            spend=spend,
            impressions=impressions,
            ctr=ctr,
            conversion_rate=conversion_rate,
            horizon_days=horizon_days,
        )
        
        # Execute prediction
        result = self.forecast_agent.predict_campaign(request)
        
        return {
            "status": "success",
            "agent": "forecast",
            "data": result,
        }
    
    # ============================================================
    # COHORT AGENT
    # ============================================================
    def _run_cohort_agent(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Execute cohort agent"""
        logger.info("Running cohort agent")
        
        cohort_period = payload.get("cohort_period", "month")
        metric = payload.get("metric", "retention")
        
        request = CohortRequest(
            cohort_period=cohort_period,
            metric=metric,
        )
        
        result = self.cohort_agent.analyze(request)
        
        return {
            "status": "success",
            "agent": "cohort",
            "data": result,
        }
    
    # ============================================================
    # ATTRIBUTION AGENT
    # ============================================================
    def _run_attribution_agent(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Execute attribution agent"""
        logger.info("Running attribution agent")
        
        model = payload.get("attribution_model", "last_click")
        metric = payload.get("metric", "conversions")
        
        request = AttributionRequest(
            model=model,
            metric=metric,
        )
        
        result = self.attribution_agent.analyze(request)
        
        return {
            "status": "success",
            "agent": "attribution",
            "data": result,
        }
    
    # ============================================================
    # FUNNEL AGENT
    # ============================================================
    def _run_funnel_agent(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Execute funnel agent"""
        logger.info("Running funnel agent")
        
        channel = payload.get("channel")
        campaign_type = payload.get("campaign_type")
        time_period = payload.get("time_period", "month")
        
        request = FunnelRequest(
            channel=channel,
            campaign_type=campaign_type,
            time_period=time_period,
        )
        
        result = self.funnel_agent.analyze(request)
        
        return {
            "status": "success",
            "agent": "funnel",
            "data": result,
        }
    
    # ============================================================
    # SCENARIO AGENT
    # ============================================================
    def _run_scenario_agent(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Execute scenario agent"""
        logger.info("Running scenario agent")
        
        base_spend = payload.get("base_spend", 10000)
        adjustments = payload.get("adjustments", {})
        scenario_name = payload.get("scenario_name", "scenario_1")
        
        request = ScenarioRequest(
            base_spend=base_spend,
            adjustments=adjustments,
            scenario_name=scenario_name,
        )
        
        result = self.scenario_agent.analyze(request)
        
        return {
            "status": "success",
            "agent": "scenario",
            "data": result,
        }
    
    # ============================================================
    # RESULT RETRIEVAL FOR DISCUSSION
    # ============================================================
    def get_agent_results(self, agent_id: str | None = None) -> Dict[str, Any]:
        """
        Retrieve stored agent results for discussion/review.
        
        Args:
            agent_id: Specific agent ID or None to get all
            
        Returns:
            Agent results
        """
        if agent_id:
            return self.agent_results.get(agent_id, {})
        else:
            return self.agent_results
    
    def get_execution_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get execution history for auditing.
        
        Args:
            limit: Maximum number of executions to return
            
        Returns:
            List of execution logs
        """
        return self.execution_history[-limit:]
    
    def get_agent_status(self) -> Dict[str, Dict[str, Any]]:
        """
        Get status of all agents.
        
        Returns:
            Dict with status of each agent
        """
        return {
            "forecast": {
                "status": "ready",
                "model_loaded": self.forecast_agent.model is not None,
                "last_execution": self.agent_results.get("forecast", {}).get("timestamp"),
            },
            "cohort": {
                "status": "ready" if hasattr(self.cohort_agent, 'analyze') else "not_implemented",
                "last_execution": self.agent_results.get("cohort", {}).get("timestamp"),
            },
            "attribution": {
                "status": "ready" if hasattr(self.attribution_agent, 'analyze') else "not_implemented",
                "last_execution": self.agent_results.get("attribution", {}).get("timestamp"),
            },
            "funnel": {
                "status": "ready" if hasattr(self.funnel_agent, 'analyze') else "not_implemented",
                "last_execution": self.agent_results.get("funnel", {}).get("timestamp"),
            },
            "scenario": {
                "status": "ready" if hasattr(self.scenario_agent, 'analyze') else "not_implemented",
                "last_execution": self.agent_results.get("scenario", {}).get("timestamp"),
            },
        }
    
    # ============================================================
    # TRAIN AGENTS
    # ============================================================
    def train_forecast_agent(self) -> Dict[str, Any]:
        """
        Train the forecast agent model.
        
        Returns:
            Training results
        """
        logger.info("Training forecast agent")
        return self.forecast_agent.train()
    
    # ============================================================
    # CLEAR RESULTS
    # ============================================================
    def clear_results(self, agent_id: str | None = None) -> None:
        """
        Clear stored results.
        
        Args:
            agent_id: Specific agent to clear, or None to clear all
        """
        if agent_id:
            if agent_id in self.agent_results:
                del self.agent_results[agent_id]
        else:
            self.agent_results.clear()

