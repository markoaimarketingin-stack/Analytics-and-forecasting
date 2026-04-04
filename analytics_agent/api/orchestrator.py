from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any, Dict, List

from analytics_agent.analytics_runner import AnalyticsRunner
from analytics_agent.clients.gemini_client import GeminiClient
from analytics_agent.logging_config import get_logger
from analytics_agent.api.agent_manager import AgentManager

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
        self.agent_manager = AgentManager()
        
        # Store clarification state across requests
        self.clarification_state: Dict[str, Any] = {}

    # ============================================================
    # Public Entry Point
    # ============================================================
    def orchestrate(self, message: str) -> Dict[str, Any]:
        if not message or not message.strip():
            raise ValueError("Message cannot be empty")

        normalized = self._normalize(message)

        # Allow users to break out of a pending clarification turn.
        if self.clarification_state.get("awaiting_clarification") and self._is_clarification_exit(normalized):
            self.clarification_state = {}

        logger.info(
            "Analytics Supervisor received request",
            message=message,
            normalized=normalized,
        )

        # If we are waiting for clarification, this turn must continue the same intent.
        is_clarification_reply = bool(self.clarification_state.get("awaiting_clarification"))

        if is_clarification_reply:
            intent = self.clarification_state.get("intent", "forecast")
            plan = {
                "mode": "analysis",
                "intent": intent,
                "agents": self.clarification_state.get("agents", ["forecast"]),
                "payload_updates": self.clarification_state.get("payload_updates", {}),
            }
            mode = "analysis"
        else:
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
        agent_ids = plan.get("agents", ["forecast"])
        agents = self._map_agents(agent_ids)

        payload = self._build_base_payload()
        payload = self._apply_payload_updates(payload, plan.get("payload_updates", {}))

        timeline: List[str] = [
            "User request received",
            f"Intent identified: {intent}",
        ]

        # ========================================================
        # CLARIFICATION STAGE (NEW)
        # ========================================================
        if is_clarification_reply:
            # Merge reply with previously extracted parameters for the same intent.
            prior = self.clarification_state.get("extracted_params", {})
            merged_params = self._merge_clarified_answers(prior, normalized)
            missing_params = self._missing_params_for_intent(intent, merged_params)

            if missing_params:
                questions = self._generate_clarification_questions(intent, missing_params)
                timeline.append("Clarification partially answered - additional details requested")

                self.clarification_state = {
                    "awaiting_clarification": True,
                    "intent": intent,
                    "agents": agent_ids,
                    "payload_updates": plan.get("payload_updates", {}),
                    "extracted_params": merged_params,
                    "missing_params": missing_params,
                }

                return {
                    "success": True,
                    "requires_clarification": True,
                    "reasoning": f"Thanks, I still need a few details:\n\n{questions}",
                    "intent": {
                        "id": intent,
                        "label": self._humanize_intent(intent),
                    },
                    "activated_agents": agents,
                    "timeline": timeline,
                    "payload": payload,
                    "result": {
                        "clarification_needed": True,
                        "questions": questions,
                        "extracted_so_far": merged_params,
                    },
                    "ui": {
                        "workspace": {"cards": []},
                        "insights_panel": {
                            "confidence_score": None,
                            "warnings": [],
                            "suggestions": [],
                        },
                    },
                    "timestamp": datetime.utcnow().isoformat(),
                }

            # Fully clarified - apply params and continue with execution.
            payload = self._apply_clarified_params_to_payload(payload, merged_params)
            timeline.append("Clarification answers received and merged")
            logger.info("Clarification merged", params=merged_params)
            self.clarification_state = {}

        else:
            clarification_needed = self._detect_clarification_needed(intent, normalized)

            if clarification_needed.get("needed"):
            # Ask clarification questions
                missing_params = clarification_needed.get("missing_params", [])
                questions = self._generate_clarification_questions(intent, missing_params)
            
                timeline.append("Clarification needed - questions generated")
            
                logger.info(
                    "Clarification needed",
                    intent=intent,
                    missing_params=missing_params,
                )
            
                # Store state for next request and lock intent routing.
                self.clarification_state = {
                    "awaiting_clarification": True,
                    "intent": intent,
                    "agents": agent_ids,
                    "payload_updates": plan.get("payload_updates", {}),
                    "extracted_params": clarification_needed.get("extracted_params", {}),
                    "missing_params": missing_params,
                }
            
                return {
                    "success": True,
                    "requires_clarification": True,
                    "reasoning": f"I need a few details to make an accurate forecast:\n\n{questions}",
                    "intent": {
                        "id": intent,
                        "label": self._humanize_intent(intent),
                    },
                    "activated_agents": agents,
                    "timeline": timeline,
                    "payload": payload,
                    "result": {
                        "clarification_needed": True,
                        "questions": questions,
                        "extracted_so_far": clarification_needed.get("extracted_params", {}),
                    },
                    "ui": {
                        "workspace": {"cards": []},
                        "insights_panel": {
                            "confidence_score": None,
                            "warnings": [],
                            "suggestions": [],
                        },
                    },
                    "timestamp": datetime.utcnow().isoformat(),
                }

            # No clarification needed; still apply directly extracted params.
            payload = self._apply_clarified_params_to_payload(
                payload,
                clarification_needed.get("extracted_params", {}),
            )

        # ========================================================
        # EXECUTE AGENTS (After Clarification)
        # ========================================================
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

    def _is_clarification_exit(self, normalized_message: str) -> bool:
        exit_tokens = [
            "hello",
            "hi",
            "hey",
            "bye",
            "cancel",
            "stop",
            "start over",
            "new request",
            "what do your agents do",
            "tell me about your agents",
            "capabilities",
        ]
        return any(token in normalized_message for token in exit_tokens)

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

        if any(
            word in msg
            for word in [
                "hi",
                "hello",
                "hey",
                "thanks",
                "who are you",
                "what can you do",
                "what does your agent do",
                "what do your agents do",
                "tell me about your agents",
                "capabilities",
            ]
        ):
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
    # Clarification System (Multi-turn Support)
    # ============================================================
    def _detect_clarification_needed(self, intent: str, message: str) -> Dict[str, Any]:
        """
        Detect if clarification is needed before executing forecast/analysis.
        
        Returns: {
            "needed": bool,
            "missing_params": List[str],
            "extracted_params": Dict[str, Any]
        }
        """
        if intent == "forecast":
            return self._detect_forecast_clarification(message)
        elif intent == "scenario_forecast":
            return self._detect_scenario_clarification(message)
        else:
            return {"needed": False, "missing_params": [], "extracted_params": {}}

    def _required_params_for_intent(self, intent: str) -> List[str]:
        if intent == "forecast":
            return ["channel", "campaign_type", "spend", "impressions", "ctr", "conversion_rate"]
        if intent == "scenario_forecast":
            return ["base_spend", "adjustments"]
        return []

    def _missing_params_for_intent(self, intent: str, params: Dict[str, Any]) -> List[str]:
        required = self._required_params_for_intent(intent)
        return [p for p in required if p not in params or params[p] is None]

    def _apply_clarified_params_to_payload(
        self,
        payload: Dict[str, Any],
        params: Dict[str, Any],
    ) -> Dict[str, Any]:
        if not params:
            return payload

        mapping = [
            "channel",
            "campaign_type",
            "spend",
            "impressions",
            "ctr",
            "conversion_rate",
            "horizon_days",
            "base_spend",
            "adjustments",
            "scenario_name",
        ]

        for key in mapping:
            if key in params and params.get(key) is not None:
                payload[key] = params[key]

        return payload
    
    def _detect_forecast_clarification(self, message: str) -> Dict[str, Any]:
        """Detect missing parameters for forecast agent"""
        required_params = ["channel", "campaign_type", "spend", "impressions", "ctr", "conversion_rate"]
        extracted = self._extract_forecast_parameters(message)
        
        missing = [p for p in required_params if p not in extracted or extracted[p] is None]
        
        return {
            "needed": len(missing) > 0,
            "missing_params": missing,
            "extracted_params": extracted,
        }
    
    def _detect_scenario_clarification(self, message: str) -> Dict[str, Any]:
        """Detect missing parameters for scenario analysis"""
        required_params = ["base_spend", "adjustments"]
        extracted = self._extract_scenario_parameters(message)
        
        missing = [p for p in required_params if p not in extracted or extracted[p] is None]
        
        return {
            "needed": len(missing) > 0,
            "missing_params": missing,
            "extracted_params": extracted,
        }
    
    def _extract_forecast_parameters(self, message: str) -> Dict[str, Any]:
        """Extract forecast parameters from user message"""
        msg_lower = message.lower()
        params = {}
        
        # Channel detection
        channels = ["google ads", "facebook", "linkedin", "email", "tiktok", "twitter", "instagram"]
        for channel in channels:
            if channel in msg_lower:
                params["channel"] = channel.title()
                break
        
        # Campaign type detection
        campaign_types = ["conversion", "awareness", "engagement", "retention", "traffic", "lead"]
        for ctype in campaign_types:
            if ctype in msg_lower:
                params["campaign_type"] = ctype.title()
                break
        
        # Spend detection (look for currency patterns)
        import re
        spend_pattern = r'\$?\s*(\d+[,.]?\d*)[kK]?'
        spend_matches = re.findall(spend_pattern, msg_lower)
        if spend_matches:
            spend_str = spend_matches[-1].replace(',', '')
            try:
                params["spend"] = float(spend_str) * (1000 if 'k' in msg_lower else 1)
            except:
                pass
        
        # Impressions detection
        if "impression" in msg_lower:
            impression_matches = re.findall(r'(\d+[,.]?\d*)[kK]?\s*impression', msg_lower)
            if impression_matches:
                try:
                    params["impressions"] = int(float(impression_matches[0].replace(',', '')) * (1000 if 'k' in msg_lower else 1))
                except:
                    pass
        
        # CTR detection
        if "ctr" in msg_lower or "click" in msg_lower:
            ctr_matches = re.findall(r'(\d+\.?\d*)%?\s*(?:ctr|click)', msg_lower)
            if ctr_matches:
                try:
                    ctr_val = float(ctr_matches[0])
                    params["ctr"] = ctr_val / 100 if ctr_val > 1 else ctr_val
                except:
                    pass
        
        # Conversion rate detection
        if "conversion" in msg_lower:
            conv_matches = re.findall(r'(\d+\.?\d*)%?\s*conversion', msg_lower)
            if conv_matches:
                try:
                    conv_val = float(conv_matches[0])
                    params["conversion_rate"] = conv_val / 100 if conv_val > 1 else conv_val
                except:
                    pass
        
        return params
    
    def _extract_scenario_parameters(self, message: str) -> Dict[str, Any]:
        """Extract scenario parameters from user message"""
        msg_lower = message.lower()
        params = {}
        
        # Base spend
        import re
        spend_pattern = r'\$?\s*(\d+[,.]?\d*)[kK]?'
        spend_matches = re.findall(spend_pattern, msg_lower)
        if spend_matches:
            try:
                params["base_spend"] = float(spend_matches[0].replace(',', ''))
            except:
                pass
        
        # Adjustments (look for percentage changes)
        if "increase" in msg_lower or "decrease" in msg_lower or "change" in msg_lower:
            adj_pattern = r'(?:increase|decrease|change|boost|cut)\s*(?:by)?\s*(\d+\.?\d*)%?'
            adj_matches = re.findall(adj_pattern, msg_lower)
            if adj_matches:
                params["adjustments"] = {"spend_change": float(adj_matches[0]) / 100}
        
        return params
    
    def _generate_clarification_questions(self, intent: str, missing_params: List[str]) -> str:
        """Generate targeted clarification questions"""
        if intent == "forecast":
            return self._generate_forecast_questions(missing_params)
        elif intent == "scenario_forecast":
            return self._generate_scenario_questions(missing_params)
        else:
            return "Could you provide more details about your request?"
    
    def _generate_forecast_questions(self, missing_params: List[str]) -> str:
        """Generate clarifying questions for forecast"""
        questions = []
        
        for param in missing_params:
            if param == "channel":
                questions.append("Which marketing channel? (Google Ads, Facebook, LinkedIn, Email, TikTok, etc.)")
            elif param == "campaign_type":
                questions.append("What type of campaign? (Conversion, Awareness, Engagement, Retention, Traffic, Lead Generation)")
            elif param == "spend":
                questions.append("What's your planned budget/spend for this campaign? (e.g., $10,000 or 10k)")
            elif param == "impressions":
                questions.append("How many impressions do you expect? (e.g., 50,000 or 50k)")
            elif param == "ctr":
                questions.append("What's your expected click-through rate? (e.g., 0.12 or 12%)")
            elif param == "conversion_rate":
                questions.append("What's your expected conversion rate? (e.g., 0.08 or 8%)")
        
        if not questions:
            return "Could you provide more details about your campaign?"
        
        return "\n".join([f"• {q}" for q in questions])
    
    def _generate_scenario_questions(self, missing_params: List[str]) -> str:
        """Generate clarifying questions for scenario"""
        questions = []
        
        for param in missing_params:
            if param == "base_spend":
                questions.append("What's your base budget for this scenario? (e.g., $10,000 or 10k)")
            elif param == "adjustments":
                questions.append("What adjustments would you like to explore? (e.g., increase by 20% or decrease by 15%)")
        
        return "\n".join([f"• {q}" for q in questions])
    
    def _merge_clarified_answers(self, extracted_params: Dict[str, Any], user_answers: str) -> Dict[str, Any]:
        """
        Parse user's answers to clarification questions and merge with extracted params.
        Uses Gemini to understand natural language answers.
        """
        if not user_answers or not user_answers.strip():
            return extracted_params
        
        # Use Gemini to parse answers
        prompt = f"""
Extract parameters from the user's answers. Return ONLY a JSON object with extracted values.

Previously extracted parameters:
{json.dumps(extracted_params, default=str)}

User's answers to clarification questions:
{user_answers}

Extract and return JSON with these fields (if mentioned):
- channel: str
- campaign_type: str
- spend: float
- impressions: int
- ctr: float (0-1)
- conversion_rate: float (0-1)
- horizon_days: int

Return ONLY valid JSON, no other text.
"""
        
        try:
            raw = self.gemini_client.generate(prompt)
            cleaned = raw.strip().replace("```json", "").replace("```", "").strip()
            parsed = json.loads(cleaned)
            
            # Merge with extracted params (user answers override)
            extracted_params.update(parsed)
            return extracted_params
        except Exception as e:
            logger.warning("Could not parse clarification answers", error=str(e))
            return extracted_params

    # ============================================================
    # Execute Analytics
    # ============================================================
    def _execute(self, intent: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        # Map intent to agents to execute
        agent_mapping = {
            "forecast": ["forecast"],
            "scenario_forecast": ["scenario", "forecast"],
            "funnel_analysis": ["funnel"],
            "attribution_analysis": ["attribution"],
            "cohort_analysis": ["cohort"],
            "dashboard": ["forecast", "funnel", "attribution", "cohort"],
            "report_generation": ["forecast", "funnel", "attribution", "cohort"],
            "budget_optimization": ["scenario"],
            "break_even": ["scenario"],
            "ltv_projection": ["cohort"],
            "executive_summary": ["forecast", "scenario", "cohort"],
        }
        
        agents_to_run = agent_mapping.get(intent, ["forecast"])
        
        # Use AgentManager to orchestrate agents
        agent_results = self.agent_manager.orchestrate(
            intent=intent,
            agents_to_run=agents_to_run,
            payload=payload,
        )
        
        # For backward compatibility, also run legacy analytics runner for certain intents
        if intent in {
            "budget_optimization",
            "break_even",
            "ltv_projection",
            "executive_summary",
        }:
            legacy_results = self._execute_legacy(intent, payload)
            agent_results["legacy_results"] = legacy_results
        
        return agent_results
    
    # ============================================================
    # Execute Legacy Analytics (backward compatibility)
    # ============================================================
    def _execute_legacy(self, intent: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Legacy execution path for backward compatibility"""
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

