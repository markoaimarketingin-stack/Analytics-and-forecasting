from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any, Dict, List

from analytics_agent.analytics_runner import AnalyticsRunner
from analytics_agent.clients.gemini_client import GeminiClient
from analytics_agent.logging_config import get_logger

logger = get_logger(__name__)


class AnalyticsSupervisor:
    """
    Production-grade orchestration layer.

    Flow:
    1. Receive user message
    2. Use Gemini to determine intent, required agents, payload changes, and response mode
    3. Execute specialist analytics agents if needed
    4. Return structured UI-friendly response
    """

    def __init__(
        self,
        analytics_runner: AnalyticsRunner,
        gemini_client: GeminiClient,
    ):
        self.analytics_runner = analytics_runner
        self.gemini_client = gemini_client

    # ============================================================
    # Public Entry Point
    # ============================================================
    def orchestrate(self, message: str) -> Dict[str, Any]:
        if not message or not message.strip():
            raise ValueError("Message cannot be empty")

        normalized = self._normalize(message)

        logger.info(
            "Analytics Supervisor received request",
            message=message,
            normalized=normalized,
        )

        plan = self._plan_with_llm(normalized)
        mode = plan.get("mode", "analysis")

        # ========================================================
        # Conversation Mode
        # ========================================================
        if mode == "conversation":
            response_message = plan.get(
                "response",
                "I am operating at peak efficiency. How can I assist you today?",
            )

            return {
                "success": True,
                "reasoning": response_message,
                "intent": {
                    "id": "conversation",
                    "label": "General Conversation",
                },
                "activated_agents": [
                    {
                        "id": "analytics_supervisor",
                        "label": "Analytics Supervisor",
                    }
                ],
                "timeline": [
                    "User request received",
                    "Conversational request identified",
                    "No specialist agents required",
                    "Response generated",
                ],
                "payload": {},
                "result": {
                    "message": response_message,
                },
                "ui": {
                    "workspace": {
                        "cards": [],
                    },
                    "insights_panel": {
                        "confidence_score": None,
                        "warnings": [],
                        "suggestions": [],
                    },
                },
                "timestamp": datetime.utcnow().isoformat(),
            }

        # ========================================================
        # Analysis Mode
        # ========================================================
        intent = plan.get("intent", "forecast")

        agents = self._map_agents(
            plan.get("agents", ["forecast"])
        )

        payload = self._build_base_payload()
        payload = self._apply_payload_updates(
            payload,
            plan.get("payload_updates", {}),
        )

        timeline: List[str] = [
            "User request received",
            f"Intent identified: {intent}",
        ]

        for agent in agents:
            timeline.append(f"{agent['label']} activated")

        try:
            result = self._execute(intent, payload)
            timeline.append("Specialist agents completed execution")
            timeline.append("Results combined")

        except Exception as exc:
            logger.exception(
                "Analytics execution failed",
                error=str(exc),
            )

            return {
                "success": False,
                "reasoning": "Analytics Supervisor could not complete the requested analysis.",
                "intent": {
                    "id": intent,
                    "label": self._humanize_intent(intent),
                },
                "activated_agents": agents,
                "timeline": timeline + ["Execution failed"],
                "payload": payload,
                "result": {
                    "error": str(exc),
                },
                "ui": {
                    "workspace": {
                        "cards": [],
                    },
                    "insights_panel": {
                        "confidence_score": None,
                        "warnings": [str(exc)],
                        "suggestions": [],
                    },
                },
                "timestamp": datetime.utcnow().isoformat(),
            }

        confidence = None
        warnings: List[str] = []
        suggestions: List[Any] = []

        if isinstance(result, dict):
            confidence = result.get("confidence_score")
            warnings = result.get("warnings", []) or []
            suggestions = (
                result.get("suggestions")
                or result.get("suggestions_list")
                or []
            )

        try:
            reasoning = self._generate_final_response(
                original_message=message,
                plan=plan,
                result=result,
            )
        except Exception:
            reasoning = (
                "Analytics Supervisor completed the analysis and generated the dashboard insights."
            )

        ui_layout = self._build_ui_layout(
            result=result,
            confidence=confidence,
            warnings=warnings,
            suggestions=suggestions,
        )

        return {
            "success": True,
            "reasoning": reasoning,
            "intent": {
                "id": intent,
                "label": self._humanize_intent(intent),
            },
            "activated_agents": agents,
            "timeline": timeline,
            "payload": payload,
            "result": result,
            "ui": ui_layout,
            "timestamp": datetime.utcnow().isoformat(),
        }

    # ============================================================
    # Message Normalization
    # ============================================================
    def _normalize(self, message: str) -> str:
        message = message.lower().strip()
        return re.sub(r"\s+", " ", message)

    # ============================================================
    # LLM Planning Layer
    # ============================================================
    def _plan_with_llm(self, message: str) -> Dict[str, Any]:
        prompt = f"""
You are Analytics Supervisor, an orchestration engine for a marketing analytics platform.

Your job:
1. Decide whether the request is conversation or analytics work
2. Select the correct specialist agents
3. Choose the correct intent
4. Return payload modifications if needed

Available agents:
- forecast
- scenario
- funnel
- attribution
- cohort
- suggestion
- dashboard
- report
- budget
- break_even
- executive

Return ONLY valid JSON.

Schema:
{{
  "mode": "conversation" | "analysis",
  "intent": "forecast" | "scenario_forecast" | "funnel_analysis" | "attribution_analysis" | "dashboard" | "report_generation" | "budget_optimization" | "break_even" | "ltv_projection" | "executive_summary",
  "agents": ["forecast", "scenario"],
  "payload_updates": {{
      "forecast_months": 3,
      "growth_rate": 0.2,
      "increase_google_ads": 0.2
  }},
  "response": "only if mode=conversation"
}}

User message:
{message}
"""

        try:
            raw = self.gemini_client.generate(prompt)
            cleaned = (
                raw.strip()
                .replace("```json", "")
                .replace("```", "")
                .strip()
            )

            parsed = json.loads(cleaned)

            if "mode" not in parsed:
                parsed["mode"] = "analysis"

            if "agents" not in parsed:
                parsed["agents"] = ["forecast"]

            if "payload_updates" not in parsed:
                parsed["payload_updates"] = {}

            return parsed

        except Exception as exc:
            logger.warning(
                "Planning failed, falling back to rules",
                error=str(exc),
            )
            return self._fallback_plan(message)

    # ============================================================
    # Rule-Based Fallback
    # ============================================================
    def _fallback_plan(self, message: str) -> Dict[str, Any]:
        msg = message.lower()

        if any(word in msg for word in ["hi", "hello", "hey", "thanks", "who are you"]):
            return {
                "mode": "conversation",
                "response": "Hello. I am Analytics Supervisor. I can help with forecasting, funnels, attribution, cohort analysis, budgets, and executive summaries.",
            }

        if any(word in msg for word in ["dashboard", "overview"]):
            return {
                "mode": "analysis",
                "intent": "dashboard",
                "agents": [
                    "forecast",
                    "scenario",
                    "funnel",
                    "attribution",
                    "cohort",
                    "dashboard",
                ],
                "payload_updates": {},
            }

        if any(word in msg for word in ["report", "pdf", "ppt"]):
            return {
                "mode": "analysis",
                "intent": "report_generation",
                "agents": [
                    "forecast",
                    "scenario",
                    "attribution",
                    "cohort",
                    "report",
                ],
                "payload_updates": {},
            }

        if any(word in msg for word in ["funnel", "conversion", "dropoff"]):
            return {
                "mode": "analysis",
                "intent": "funnel_analysis",
                "agents": ["funnel", "suggestion"],
                "payload_updates": {},
            }

        if any(word in msg for word in ["cohort", "retention", "ltv"]):
            return {
                "mode": "analysis",
                "intent": "ltv_projection",
                "agents": ["cohort"],
                "payload_updates": {},
            }

        return {
            "mode": "analysis",
            "intent": "forecast",
            "agents": ["forecast"],
            "payload_updates": {},
        }

    # ============================================================
    # Base Payload
    # ============================================================
    def _build_base_payload(self) -> Dict[str, Any]:
        return {
            "primary_kpi": "revenue",
            "channel_performance": {
                "google_ads": {
                    "spend": 12000,
                    "conversions": 140,
                    "revenue": 68000,
                },
                "facebook": {
                    "spend": 7000,
                    "conversions": 72,
                    "revenue": 41000,
                },
                "linkedin": {
                    "spend": 4000,
                    "conversions": 28,
                    "revenue": 18000,
                },
                "email": {
                    "spend": 1500,
                    "conversions": 40,
                    "revenue": 12000,
                },
            },
            "historical_data": [
                {"month": "2025-10", "revenue": 81000},
                {"month": "2025-11", "revenue": 86000},
                {"month": "2025-12", "revenue": 92000},
                {"month": "2026-01", "revenue": 98000},
            ],
            "conversion_rates": {
                "ctr": 0.028,
                "lpv_rate": 0.52,
                "atc_rate": 0.10,
                "conversion_rate": 0.061,
            },
            "revenue_data": {
                "aov": 520,
                "ltv": 2450,
            },
            "cost_structure": {
                "variable_cogs_rate": 0.31,
            },
            "structured_context": {
                "forecast_months": 6,
                "projected_growth_rate": 0.12,
                "market_condition": "stable",
                "seasonality_multipliers": [1.0, 1.05, 1.08, 1.12, 1.16, 1.20],
            },
        }

    # ============================================================
    # Payload Updates
    # ============================================================
    def _apply_payload_updates(
        self,
        payload: Dict[str, Any],
        updates: Dict[str, Any],
    ) -> Dict[str, Any]:
        if not updates:
            return payload

        if "forecast_months" in updates:
            payload["structured_context"]["forecast_months"] = updates["forecast_months"]

        if "growth_rate" in updates:
            payload["structured_context"]["projected_growth_rate"] = updates["growth_rate"]

        if "increase_google_ads" in updates:
            payload["channel_performance"]["google_ads"]["spend"] *= (
                1 + updates["increase_google_ads"]
            )

        if "increase_facebook" in updates:
            payload["channel_performance"]["facebook"]["spend"] *= (
                1 + updates["increase_facebook"]
            )

        return payload

    # ============================================================
    # Agent Mapping
    # ============================================================
    def _map_agents(self, agent_ids: List[str]) -> List[Dict[str, str]]:
        mapping = {
            "forecast": "Forecast Agent",
            "scenario": "Scenario Agent",
            "funnel": "Funnel Agent",
            "attribution": "Attribution Agent",
            "cohort": "Cohort Agent",
            "suggestion": "Suggestion Agent",
            "dashboard": "Dashboard Agent",
            "report": "Report Agent",
            "budget": "Budget Optimization Agent",
            "break_even": "Break-even Agent",
            "executive": "Executive Summary Agent",
        }

        return [
            {
                "id": agent_id,
                "label": mapping.get(agent_id, agent_id.title()),
            }
            for agent_id in agent_ids
        ]

    # ============================================================
    # Execute Analytics
    # ============================================================
    def _execute(self, intent: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        if intent in {
            "forecast",
            "scenario_forecast",
            "funnel_analysis",
            "attribution_analysis",
            "dashboard",
            "report_generation",
        }:
            return self.analytics_runner.run(payload)

        if intent == "budget_optimization":
            return {
                "budget_sensitivity": self.analytics_runner.budget_sensitivity(
                    payload,
                    budgets=[10000, 15000, 20000, 25000, 30000, 40000],
                )
            }

        if intent == "break_even":
            return self.analytics_runner.break_even(payload)

        if intent == "ltv_projection":
            return self.analytics_runner.ltv_projection(payload, months=12)

        if intent == "executive_summary":
            return self.analytics_runner.cfo_mode(payload)

        return self.analytics_runner.run(payload)

    # ============================================================
    # Final Response Generation
    # ============================================================
    def _generate_final_response(
        self,
        original_message: str,
        plan: Dict[str, Any],
        result: Dict[str, Any],
    ) -> str:
        prompt = f"""
You are Analytics Supervisor.

Write a concise and professional response.

User request:
{original_message}

Intent:
{plan.get('intent')}

Agents:
{plan.get('agents')}

Result:
{json.dumps(result, default=str)[:5000]}

Write 1-3 paragraphs describing:
- what was analyzed
- key findings
- recommended next step
"""

        return self.gemini_client.generate(prompt)

    # ============================================================
    # UI Layout Builder
    # ============================================================
    def _build_ui_layout(
        self,
        result: Dict[str, Any],
        confidence: Any,
        warnings: List[str],
        suggestions: List[Any],
    ) -> Dict[str, Any]:
        cards: List[Dict[str, Any]] = []

        if isinstance(result, dict):
            if result.get("forecast_results"):
                cards.append({
                    "type": "forecast_chart",
                    "title": "Revenue Forecast",
                })

            if result.get("scenarios"):
                cards.append({
                    "type": "scenario_cards",
                    "title": "Scenario Comparison",
                })

            if result.get("funnel_model"):
                cards.append({
                    "type": "funnel_chart",
                    "title": "Funnel Analysis",
                })

            if result.get("attribution_model"):
                cards.append({
                    "type": "attribution_chart",
                    "title": "Attribution Overview",
                })

            if result.get("cohort_results"):
                cards.append({
                    "type": "cohort_chart",
                    "title": "Cohort Performance",
                })

        return {
            "workspace": {
                "cards": cards,
            },
            "insights_panel": {
                "confidence_score": confidence,
                "warnings": warnings or [],
                "suggestions": suggestions or [],
            },
        }

    # ============================================================
    # Human Friendly Intent Label
    # ============================================================
    def _humanize_intent(self, intent: str) -> str:
        return intent.replace("_", " ").title()

