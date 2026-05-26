
import json
from datetime import datetime
from typing import Any, Dict, List

from analytics_agent.logging_config import get_logger
from analytics_agent.agents.orchestrator_agent import (
    OrchestratorAgent,
    OrchestratorRequest,
)
from analytics_agent.clients.gemini_client import GeminiClient

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
        self.gemini_client = GeminiClient()
        from analytics_agent.agents.data_query_agent import DataQueryAgent
        self.query_agent = DataQueryAgent(gemini_client=self.gemini_client)

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

            # Redesign Suggestions Pipeline: 100% LLM assisted and query-driven
            client_id = payload.get("client_id") or "anonymous-client"
            enriched = self._generate_suggestions_with_llm(state, client_id)

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
                "recommendations": enriched,
                "executive_summary": state.executive_summary,
                "confidence_score": (
                    getattr(state.forecast_analysis, "confidence", None)
                    if state.forecast_analysis
                    else None
                ),
                "warnings": [],
                "suggestions": enriched,
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

    def _enrich_recommendations_with_llm(
        self,
        raw_recommendations: list[str],
        executive_summary: str,
        result_data: dict,
    ) -> list[dict]:
        if not self.gemini_client or not getattr(self.gemini_client, "enabled", False):
            return [
                {
                    "title": rec,
                    "description": f"Detailed logic for '{rec}': Based on active performance indicators and campaign metrics.",
                    "expected_impact": "Expected to improve campaign efficiency, ROAS, and overall customer retention within the next 7-14 days.",
                    "prompt": rec,
                }
                for rec in raw_recommendations
            ]

        prompt = f"""
You are the Chief Marketing Analytics Strategist.
An analytics orchestration run has finished. We generated these basic recommendations:
{raw_recommendations}

Executive Summary of results:
{executive_summary}

Detailed Analysis Results:
{json.dumps(result_data, default=str)[:6000]}

Your job is to expand each basic recommendation into a premium, deep, highly professional, and analytics-driven recommendation.
Generate a JSON array of objects, where each object corresponds to a recommendation and has the following exact keys:
1. "title": A premium, short, action-oriented title (e.g. "CampaignA_Adset1_18052026 DECREASE" or "Scale High-Performing Funnel Stages"). Make sure it matches the format in the user's mockup.
2. "description": A deep, detailed, and analytical logic explaining EXACTLY why this recommendation was made by the LLM based on the actual metrics and data provided above. Be specific about conversion rates, drop-offs, ROAS, ROI, spend, or customer cohort retention numbers where applicable.
3. "expected_impact": What specific impact can the client expect after executing this action. Be specific, realistic, and analytics-driven (e.g. "Expected to recapture 15% of cart drop-offs, boosting overall revenue by 5.2%").
4. "prompt": The direct instruction/action prompt.

Return ONLY a valid JSON array of objects. Do not return any markdown code blocks, formatting, or conversational text.
"""
        try:
            raw = self.gemini_client.generate(prompt)
            cleaned = raw.strip().replace("```json", "").replace("```", "").strip()
            parsed = json.loads(cleaned)
            if isinstance(parsed, list) and len(parsed) > 0:
                return parsed
        except Exception as e:
            logger.warning(f"Failed to enrich recommendations with Gemini: {e}")

        # Fallback
        return [
            {
                "title": rec,
                "description": f"Detailed logic for '{rec}': Based on active performance indicators and campaign metrics.",
                "expected_impact": "Expected to improve campaign efficiency, ROAS, and overall customer retention within the next 7-14 days.",
                "prompt": rec,
            }
            for rec in raw_recommendations
        ]

    def _generate_suggestions_with_llm(self, state: Any, client_id: str) -> list[dict[str, Any]]:
        # 1. Compile agent state summaries
        agent_summaries = {}
        if state.attribution_analysis:
            agent_summaries["attribution_analysis"] = self._serialize(state.attribution_analysis)
        if state.funnel_analysis:
            agent_summaries["funnel_analysis"] = self._serialize(state.funnel_analysis)
        if state.cohort_analysis:
            agent_summaries["cohort_analysis"] = self._serialize(state.cohort_analysis)
        if state.forecast_analysis:
            agent_summaries["forecast_analysis"] = self._serialize(state.forecast_analysis)
        if state.scenario_analysis:
            agent_summaries["scenario_analysis"] = self._serialize(state.scenario_analysis)
        if state.budget_allocation_analysis:
            agent_summaries["budget_allocation_analysis"] = self._serialize(state.budget_allocation_analysis)

        # 2. Build high quality fallback recommendations list
        fallback_suggestions = []
        if state.attribution_analysis and getattr(state.attribution_analysis, "recommended_shift", None):
            shift = state.attribution_analysis.recommended_shift
            fallback_suggestions.append({
                "title": "OPTIMIZE ATTRIBUTION CONTRIBUTION",
                "description": f"Shift {shift.get('percent', 0)}% of marketing budget from lower-performing channels ({shift.get('from', 'low performers')}) to high-performing ones ({shift.get('to', 'top channel')}) based on multi-touch attribution analysis.",
                "expected_impact": "Expected to improve blended ROAS by 12% and lower overall Customer Acquisition Cost (CAC) by maximizing high-contribution channels.",
                "prompt": f"Shift {shift.get('percent', 0)}% budget from {shift.get('from', 'low performers')} to {shift.get('to', 'top channel')}"
            })
        if state.funnel_analysis and getattr(state.funnel_analysis, "largest_dropoff", None):
            drop = state.funnel_analysis.largest_dropoff.replace('_', ' ')
            fallback_suggestions.append({
                "title": "IMPROVE CONVERSION FUNNEL PIPELINE",
                "description": f"Identify friction points and drop-offs at the '{drop}' phase. Analytics indicate a significant drop in conversion efficiency at this specific junction.",
                "expected_impact": "Expected to recover lost prospect traffic, lifting bottom-funnel completions by 5% to 10% and driving higher average order value.",
                "prompt": f"Improve {drop} to capture conversion upside"
            })
        if state.cohort_analysis and getattr(state.cohort_analysis, "high_value_segment", None):
            seg = state.cohort_analysis.high_value_segment
            fallback_suggestions.append({
                "title": "TARGET HIGH-VALUE RETENTION COHORT",
                "description": f"Engage the '{seg}' customer cohort with tailored loyalty programs and personalized outreach, as cohort retention maps show they have high lifetime value.",
                "expected_impact": "Expected to extend cohort retention metrics by 15% and increase overall Customer Lifetime Value (LTV) through targeted engagement.",
                "prompt": f"Target {seg} customers with retention offers"
            })
        if state.budget_allocation_analysis and getattr(state.budget_allocation_analysis, "channel_allocations", None):
            allocs = state.budget_allocation_analysis.channel_allocations
            if isinstance(allocs, list) and len(allocs) > 0:
                top = allocs[0]
                fallback_suggestions.append({
                    "title": "OPTIMIZE BUDGET ALLOCATION MODEL",
                    "description": f"Reallocate budget to assign ${top.get('recommended_spend', 0):,.0f} to {top.get('channel', 'top channel')} as guided by the {state.budget_allocation_analysis.objective} optimization algorithm.",
                    "expected_impact": f"Expected to maximize total conversions while ensuring risk tolerance settings ({state.budget_allocation_analysis.risk_tolerance}) are adhered to.",
                    "prompt": f"Allocate ${top.get('recommended_spend', 0):,.0f} to {top.get('channel', 'top channel')} for {state.budget_allocation_analysis.objective} optimization"
                })

        if not fallback_suggestions:
            fallback_suggestions = [
                {
                    "title": "REENGAGE HIGH LTV CUSTOMER SEGMENTS",
                    "description": "Create automated re-engagement email and SMS workflows targeted at cohorts with high initial spend but declining 90-day retention indicators.",
                    "expected_impact": "Expected to lift customer retention by 4.2% and reactivate dormant purchasers with high lifetime value metrics.",
                    "prompt": "Create retention and re-engagement campaign for high-value cohorts"
                },
                {
                    "title": "IMPROVE IMPRESSIONS TO CLICKS TO CAPTURE",
                    "description": "Analyze click-through-rate (CTR) patterns across active ad sets to identify creative fatigue and optimize audience targeting parameters.",
                    "expected_impact": "Expected to lift CTR by 15-20%, lowering effective Cost-Per-Click (CPC) and boosting top-of-funnel volume.",
                    "prompt": "Optimize audience targeting and creatives to improve impressions-to-clicks conversion"
                }
            ]

        if not self.gemini_client or not getattr(self.gemini_client, "enabled", False):
            logger.info("GeminiClient disabled, returning structured fallback recommendations.")
            return fallback_suggestions

        # 3. Ask Gemini if it needs database queries
        query_results = []
        max_query_rounds = 2
        for round_idx in range(max_query_rounds):
            prompt = f"""
You are the Chief Marketing Analytics Strategist.
We are running a strategic analysis pipeline for client '{client_id}'.

Here is the state/summary of the specialist agents:
{json.dumps(agent_summaries, default=str, indent=2)}

Previous database query results (if any):
{json.dumps(query_results, default=str, indent=2)}

You have access to a `DataQueryAgent` that can run natural language database queries on the client's marketing and customer databases (tables like campaigns, customers, events, transactions, and retention).
If you need deeper campaign, cohort, funnel, or user details to investigate patterns, drop-offs, or check specific campaign metrics before making your final professional recommendations, you can request a database query.

Decide if you need to run a natural language query to get more information.
Respond with a JSON object containing exactly these fields:
1. "needs_query": boolean (true if you need to query the database, false if you have enough information or if previous query results are sufficient)
2. "query_prompt": string (the natural language prompt for the query. Be clear and specific. Leave empty if needs_query is false)

Return ONLY a valid JSON object. Do not include any markdown styling, formatting, or conversational text.
"""
            try:
                raw_response = self.gemini_client.generate(prompt)
                cleaned = raw_response.strip().replace("```json", "").replace("```", "").strip()
                parsed = json.loads(cleaned)
                if not parsed.get("needs_query") or not parsed.get("query_prompt"):
                    break
                
                query_prompt = parsed["query_prompt"]
                logger.info(f"LLM Strategist requested dynamic query in round {round_idx + 1}: {query_prompt}")
                
                # Execute the query using DataQueryAgent
                from analytics_agent.agents.data_query_agent import DataQueryRequest
                req = DataQueryRequest(prompt=query_prompt, client_id=client_id)
                execution_result = self.query_agent.run(req)
                
                # Extract relevant fields to keep prompt size under control
                simplified_res = {
                    "query": query_prompt,
                    "status": execution_result.get("status"),
                    "row_count": execution_result.get("row_count", 0),
                    "columns": execution_result.get("columns", []),
                    "rows": execution_result.get("rows", [])[:20], # limit rows to avoid bloating prompt
                }
                query_results.append(simplified_res)
            except Exception as e:
                logger.warning(f"Error in LLM suggestion query planning round {round_idx}: {e}")
                break

        # 4. Prompt Gemini to do the final strategic suggestion generation
        final_prompt = f"""
You are the Chief Marketing Analytics Strategist.
An analytics orchestration run has finished for client '{client_id}'.

Here is the state/summary of the specialist agents:
{json.dumps(agent_summaries, default=str, indent=2)}

Here are the results of dynamic database queries executed during planning:
{json.dumps(query_results, default=str, indent=2)}

Your job is to generate a comprehensive set of premium, deep, highly professional, and analytics-driven marketing recommendations.
Ensure the suggestions are deep, highly specific, metrics-oriented, and directly grounded in the data shown above. Do not use generic, generic-sounding, or placeholder suggestions.

Generate a JSON array of recommendation/suggestion objects, where each object has the following exact keys:
1. "title": A premium, short, action-oriented title in uppercase with priority/category prefix if applicable (e.g. "OPTIMIZE LOWER FUNNEL CONVERSION" or "REALLOCATE BUDGET TO META LEADS" or "SCALE META CLICKS TO CONVERT").
2. "description": A deep, detailed, and analytical logic explaining EXACTLY why this recommendation was made by the LLM, referencing specific metrics, percentages, dollar amounts, campaigns, cohorts, channels, or drop-offs. Provide the statistical and strategic context clearly so the client is convinced by the reasoning.
3. "expected_impact": A clear explanation of what specific business or campaign impact the client can expect after executing this action. Must be specific, realistic, and analytics-driven (e.g. "Expected to recapture 15% of checkout drop-offs, boosting monthly conversion by 1.8% and adding $12,400 to the bottom line").
4. "prompt": The direct instruction/action prompt. Clicking execute will enter this chat prompt.

Return ONLY a valid JSON array of objects. Do not return any markdown code blocks, formatting, or conversational text.
"""
        try:
            raw_response = self.gemini_client.generate(final_prompt)
            cleaned = raw_response.strip().replace("```json", "").replace("```", "").strip()
            parsed = json.loads(cleaned)
            if isinstance(parsed, list) and len(parsed) > 0:
                logger.info(f"LLM Strategist successfully generated {len(parsed)} recommendations.")
                # Standardize keys to match expected output fields
                standardized = []
                for item in parsed:
                    if not isinstance(item, dict):
                        continue
                    standardized.append({
                        "title": str(item.get("title") or "").strip(),
                        "description": str(item.get("description") or "").strip(),
                        "expected_impact": str(item.get("expected_impact") or "").strip(),
                        "prompt": str(item.get("prompt") or "").strip()
                    })
                if standardized:
                    return standardized
        except Exception as e:
            logger.warning(f"Failed to generate LLM-assisted suggestions: {e}")

        return fallback_suggestions

