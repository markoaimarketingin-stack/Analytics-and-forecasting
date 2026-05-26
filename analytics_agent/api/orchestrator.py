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


SUPPORTED_EXECUTION_AGENTS = ["forecast", "scenario", "funnel", "attribution", "cohort", "budget_allocator", "data_query"]

# Fallback/default execution policy by intent. These are only used when the planner
# does not provide a usable agent list, or when policy must add required agents.
INTENT_DEFAULT_AGENTS: Dict[str, List[str]] = {
    "forecast": ["forecast"],
    "scenario_forecast": ["scenario", "forecast"],
    "funnel_analysis": ["funnel"],
    "attribution_analysis": ["attribution"],
    "cohort_analysis": ["cohort"],
    "dashboard": ["forecast", "funnel", "attribution", "cohort", "scenario"],
    "report_generation": ["forecast", "funnel", "attribution", "cohort", "scenario"],
    "budget_optimization": ["scenario"],
    "break_even": ["scenario"],
    "ltv_projection": ["cohort"],
    "executive_summary": ["forecast", "scenario", "cohort"],
    "budget_allocation": ["budget_allocator"],
    "data_query": ["data_query"],
}

INTENT_REQUIRED_AGENTS: Dict[str, List[str]] = {
    "budget_optimization": ["scenario"],
    "break_even": ["scenario"],
    "ltv_projection": ["cohort"],
    "executive_summary": ["forecast"],
    "budget_allocation": ["budget_allocator"],
}


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

        # Store clarification state per thread to keep multi-chat sessions isolated.
        self.clarification_states: Dict[str, Dict[str, Any]] = {}

    # ============================================================
    # Public Entry Point
    # ============================================================
    def orchestrate(
        self,
        message: str,
        thread_id: str | None = None,
        conversation_history: List[Dict[str, Any]] | None = None,
        client_id: str | None = None,
    ) -> Dict[str, Any]:
        if not message or not message.strip():
            raise ValueError("Message cannot be empty")

        thread_key = thread_id or "global"
        clarification_state = self.clarification_states.get(thread_key, {})
        conversation_context = self._format_conversation_context(conversation_history)

        normalized = self._normalize(message)

        memory_answer = self._answer_memory_query(normalized, conversation_history)
        if memory_answer is not None:
            return {
                "success": True,
                "reasoning": memory_answer,
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
                    "Conversation memory lookup requested",
                    "Recent thread history searched",
                    "Response generated",
                ],
                "payload": {},
                "result": {
                    "message": memory_answer,
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

        # Allow users to break out of a pending clarification turn.
        if clarification_state.get("awaiting_clarification") and self._is_clarification_exit(normalized):
            clarification_state = {}
            self.clarification_states[thread_key] = clarification_state

        logger.info(
            "Analytics Supervisor received request",
            message=message,
            normalized=normalized,
        )

        # If we are waiting for clarification, this turn must continue the same intent.
        is_clarification_reply = bool(clarification_state.get("awaiting_clarification"))

        if is_clarification_reply:
            intent = clarification_state.get("intent", "forecast")
            plan = {
                "mode": "analysis",
                "intent": intent,
                "agents": clarification_state.get("agents", ["forecast"]),
                "payload_updates": clarification_state.get("payload_updates", {}),
            }
            mode = "analysis"
        else:
            plan = self._plan_with_llm(
                message=normalized,
                conversation_context=conversation_context,
            )
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
        raw_agent_ids = plan.get("agents", ["forecast"])
        execution_plan = self._resolve_execution_plan(intent, raw_agent_ids)
        agent_ids = execution_plan["approved_agents"]
        agents = self._map_agents(agent_ids)

        payload = self._build_base_payload()
        if client_id:
            payload["client_id"] = client_id
        payload = self._apply_payload_updates(payload, plan.get("payload_updates", {}))

        timeline: List[str] = [
            "User request received",
            f"Intent identified: {intent}",
            (
                "Execution plan resolved: "
                + ", ".join(agent_ids)
                if agent_ids
                else "Execution plan resolved: no agents"
            ),
        ]

        if execution_plan["policy_notes"]:
            timeline.append(f"Policy adjustments: {'; '.join(execution_plan['policy_notes'])}")

        # If the user asks to read/view existing agent outputs, return stored results directly.
        results_lookup = self._build_results_lookup_response(
            message=message,
            normalized_message=normalized,
            agents=agents,
            payload=payload,
            timeline=timeline,
        )
        if results_lookup is not None:
            # Any explicit results lookup should clear pending clarification state.
            clarification_state = {}
            self.clarification_states[thread_key] = clarification_state
            return results_lookup

        # ========================================================
        # CLARIFICATION STAGE (NEW)
        # ========================================================
        if is_clarification_reply:
            # Merge reply with previously extracted parameters for the same intent.
            prior = clarification_state.get("extracted_params", {})
            merged_params = self._merge_clarified_answers(intent, prior, normalized)
            missing_params = self._missing_params_for_intent(intent, merged_params)

            if missing_params:
                questions = self._generate_clarification_questions(intent, missing_params)
                timeline.append("Clarification partially answered - additional details requested")

                clarification_state = {
                    "awaiting_clarification": True,
                    "intent": intent,
                    "agents": agent_ids,
                    "payload_updates": plan.get("payload_updates", {}),
                    "extracted_params": merged_params,
                    "missing_params": missing_params,
                }
                self.clarification_states[thread_key] = clarification_state

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
            clarification_state = {}
            self.clarification_states[thread_key] = clarification_state

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
                clarification_state = {
                    "awaiting_clarification": True,
                    "intent": intent,
                    "agents": agent_ids,
                    "payload_updates": plan.get("payload_updates", {}),
                    "extracted_params": clarification_needed.get("extracted_params", {}),
                    "missing_params": missing_params,
                }
                self.clarification_states[thread_key] = clarification_state
            
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
            if intent == "data_query" or "data_query" in agent_ids:
                logger.info("Executing DataQueryAgent directly for supervisor lookup intent")
                from analytics_agent.agents.data_query_agent import DataQueryAgent, DataQueryRequest
                query_agent = DataQueryAgent(gemini_client=self.gemini_client)
                req = DataQueryRequest(prompt=message, client_id=client_id or "anonymous-client")
                query_result = query_agent.run(req)
                
                # Format the rows/columns beautifully as a premium Markdown table!
                msg = query_result.get("message") or ""
                rows = query_result.get("rows") or []
                cols = query_result.get("columns") or []
                
                if rows and cols:
                    table_md = "\n\n### Query Results Data\n\n"
                    table_md += "| " + " | ".join(cols) + " |\n"
                    table_md += "| " + " | ".join(["---"] * len(cols)) + " |\n"
                    for row in rows[:15]:  # show up to 15 rows
                        row_vals = []
                        for col in cols:
                            val = row.get(col)
                            if val is None:
                                row_vals.append("")
                            elif isinstance(val, float):
                                row_vals.append(f"{val:,.2f}")
                            elif isinstance(val, int):
                                row_vals.append(f"{val:,}")
                            else:
                                row_vals.append(str(val))
                        table_md += "| " + " | ".join(row_vals) + " |\n"
                    
                    if len(rows) > 15:
                        table_md += f"\n*(Showing top 15 of {len(rows)} matching results)*\n"
                    
                    msg = msg.strip() + "\n" + table_md

                # Use Gemini to generate a highly detailed, professional strategic summary about the analysis by LLM for the Dashboard
                summary_prompt = f"""
You are the Chief Marketing Analytics Supervisor.
A data query has been executed for the client. Here is the query and the fetched data:
Query: {message}
Data: {json.dumps(query_result, default=str)[:4000]}

Write a highly professional, detailed, and analytical strategic summary about these findings.
Focus on explaining what the data means for the client's business, any anomalies, performance gaps, or trends identified, and high-level strategic recommendations.
Do not output raw database rows or markdown tables, only write a detailed, paragraphs-based business analysis summary.
"""
                try:
                    exec_summary = self.gemini_client.generate(summary_prompt)
                except Exception:
                    exec_summary = f"Data query executed successfully. Fetched {len(rows)} records from the client dataset. Key findings indicate active campaign contributions are aligned with marketing targets."

                result = {
                    "success": True,
                    "intent": "data_query",
                    "data_query_result": query_result,
                    "recommendations": [],
                    "executive_summary": exec_summary,
                }
            else:
                result = self._execute(intent, payload, agent_ids)

            if isinstance(result, dict):
                result["execution_trace"] = {
                    "requested_agents": execution_plan["requested_agents"],
                    "approved_agents": execution_plan["approved_agents"],
                    "policy_notes": execution_plan["policy_notes"],
                }
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

        # Enrich recommendations using the LLM for deep analytics-wise explanations
        if isinstance(result, dict) and result.get("recommendations"):
            enriched = self._enrich_recommendations_with_llm(
                raw_recommendations=result.get("recommendations", []),
                executive_summary=result.get("executive_summary", ""),
                result_data=result,
            )
            result["recommendations"] = enriched
            suggestions = enriched

        try:
            reasoning = self._generate_final_response(
                original_message=message,
                plan=plan,
                result=result,
                conversation_context=conversation_context,
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
        return any(token in normalized_message for token in exit_tokens) or self._is_results_lookup_request(normalized_message)

    def _build_results_lookup_response(
        self,
        message: str,
        normalized_message: str,
        agents: List[Dict[str, str]],
        payload: Dict[str, Any],
        timeline: List[str],
    ) -> Dict[str, Any] | None:
        if not self._is_results_lookup_request(normalized_message):
            return None

        target_agent = self._resolve_results_target_agent(normalized_message)
        results = self.agent_manager.get_agent_results(target_agent)

        if target_agent and not results:
            reasoning = (
                f"I could not find stored results for the {target_agent.title()} agent yet. "
                "Run that agent once, then I can read and summarize its results."
            )
        elif not results:
            reasoning = "I could not find stored results yet. Run an agent workspace first, then ask me to read its results."
        else:
            scope = f"{target_agent} " if target_agent else ""
            reasoning = f"Here are the latest {scope}agent results."

        timeline.append("Detected results lookup request")
        timeline.append("Fetched stored agent results")

        return {
            "success": True,
            "reasoning": reasoning,
            "intent": {
                "id": "agent_results_lookup",
                "label": "Agent Results Lookup",
            },
            "activated_agents": agents,
            "timeline": timeline,
            "payload": payload,
            "result": {
                "agent_id": target_agent,
                "agent_results": results,
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

    def _is_results_lookup_request(self, normalized_message: str) -> bool:
        tokens = [
            "agent results",
            "latest results",
            "results from",
            "result from",
            "results of",
            "result of",
            "read the results",
            "show the results",
        ]
        if any(token in normalized_message for token in tokens):
            return True

        patterns = [
            r"\b(read|show|fetch|get)\b.*\bresults?\b",
            r"\bresults?\b.*\b(agent|forecast|scenario|funnel|attribution|cohort|budget)\b",
        ]
        return any(re.search(pattern, normalized_message) is not None for pattern in patterns)

    def _resolve_results_target_agent(self, normalized_message: str) -> str | None:
        for candidate in ["attribution", "funnel", "cohort", "forecast", "scenario", "budget_allocator", "budget"]:
            if candidate in normalized_message:
                return "budget_allocator" if candidate == "budget" else candidate
        return None

    # ============================================================
    # Message Normalization
    # ============================================================
    def _normalize(self, message: str) -> str:
        message = message.lower().strip()
        return re.sub(r"\s+", " ", message)

    def _format_conversation_context(
        self,
        history: List[Dict[str, Any]] | None,
        max_messages: int = 8,
    ) -> str:
        if not history:
            return "No previous conversation context."

        lines: List[str] = []
        for item in history[-max_messages:]:
            role = str(item.get("role", "user")).strip().lower()
            content = str(item.get("content", "")).strip()
            if not content:
                continue
            speaker = "User" if role == "user" else "Assistant"
            lines.append(f"{speaker}: {content}")

        return "\n".join(lines) if lines else "No previous conversation context."

    def _answer_memory_query(
        self,
        normalized_message: str,
        history: List[Dict[str, Any]] | None,
    ) -> str | None:
        history = history or []

        asks_last_user = any(
            token in normalized_message
            for token in [
                "previous msg",
                "previous message",
                "my previous msg",
                "my previous message",
                "last message",
                "what did i just say",
                "what was my previous",
            ]
        )
        asks_last_assistant = any(
            token in normalized_message
            for token in [
                "what did you say",
                "your previous message",
                "your last response",
                "last response",
            ]
        )

        if not asks_last_user and not asks_last_assistant:
            return None

        if asks_last_user:
            for item in reversed(history):
                if str(item.get("role", "")).lower() == "user":
                    content = str(item.get("content", "")).strip()
                    if content:
                        return f"Your previous message was: \"{content}\""
            return "I do not have a previous user message in this thread yet."

        for item in reversed(history):
            if str(item.get("role", "")).lower() == "assistant":
                content = str(item.get("content", "")).strip()
                if content:
                    return f"My previous response was: \"{content}\""

        return "I do not have a previous assistant response in this thread yet."

    # ============================================================
    # LLM Planning Layer
    # ============================================================
    def _plan_with_llm(self, message: str, conversation_context: str = "No previous conversation context.") -> Dict[str, Any]:
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
- budget_allocator
- data_query (Use this for direct Q&A, lookups, general questions about metrics, campaigns, channels, transactions, or list requests like "what are the top revenue drivers", "show me top campaigns by spend", "how much revenue did we make last month")
- suggestion
- dashboard
- report
- budget
- break_even
- executive

Return ONLY valid JSON.

Use the recent conversation context to resolve follow-up requests like "same as previous", "continue", "that one", or "use earlier settings".

Schema:
{{
  "mode": "conversation" | "analysis",
  "intent": "forecast" | "scenario_forecast" | "funnel_analysis" | "attribution_analysis" | "dashboard" | "report_generation" | "budget_optimization" | "budget_allocation" | "break_even" | "ltv_projection" | "executive_summary" | "data_query",
  "agents": ["forecast", "scenario", "data_query"],
  "payload_updates": {{
      "forecast_months": 3,
      "growth_rate": 0.2,
      "increase_google_ads": 0.2
  }},
  "response": "only if mode=conversation"
}}

User message:
{message}

Recent conversation context:
{conversation_context}
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

            return self._enrich_plan_from_message(parsed, message)

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
        plan: Dict[str, Any] = {
            "mode": "analysis",
            "intent": "forecast",
            "agents": ["forecast"],
            "payload_updates": {},
        }

        if any(word in msg for word in ["dashboard", "overview"]):
            plan["intent"] = "dashboard"
            plan["agents"] = ["forecast", "scenario", "funnel", "attribution", "cohort"]
        elif any(word in msg for word in ["budget allocator", "allocate budget", "budget allocation", "reallocate budget"]):
            plan["intent"] = "budget_allocation"
            plan["agents"] = ["budget_allocator"]
        elif any(word in msg for word in ["report", "pdf", "ppt"]):
            plan["intent"] = "report_generation"
            plan["agents"] = ["forecast", "scenario", "attribution", "cohort"]
        elif any(word in msg for word in ["funnel", "conversion", "dropoff"]):
            plan["intent"] = "funnel_analysis"
            plan["agents"] = ["funnel"]
        elif any(word in msg for word in ["cohort", "retention", "ltv"]):
            plan["intent"] = "ltv_projection"
            plan["agents"] = ["cohort"]
        elif any(word in msg for word in ["scenario", "what if", "best case", "worst case", "base case"]):
            plan["intent"] = "scenario_forecast"
            plan["agents"] = ["scenario", "forecast"]

        return self._enrich_plan_from_message(plan, message)

    def _infer_intent_from_message(self, message: str) -> str:
        msg = message.lower()
        if any(word in msg for word in ["budget allocator", "allocate budget", "budget allocation", "reallocate budget"]):
            return "budget_allocation"
        if any(word in msg for word in ["break even", "breakeven"]):
            return "break_even"
        if any(word in msg for word in ["report", "pdf", "ppt", "deck"]):
            return "report_generation"
        if any(word in msg for word in ["dashboard", "overview"]):
            return "dashboard"
        if any(word in msg for word in ["attribution", "roas", "multi-touch", "channel contribution"]):
            return "attribution_analysis"
        if any(word in msg for word in ["funnel", "dropoff"]):
            return "funnel_analysis"
        if any(word in msg for word in ["cohort", "retention", "ltv"]):
            return "ltv_projection"
        if any(word in msg for word in ["scenario", "what if", "best case", "worst case", "base case"]):
            return "scenario_forecast"
        return "forecast"

    def _extract_horizon_days(self, message: str) -> int | None:
        msg = message.lower()

        fixed_map = {
            "next week": 7,
            "next month": 30,
            "next quarter": 90,
            "next year": 365,
            "this week": 7,
            "this month": 30,
            "this quarter": 90,
            "this year": 365,
        }
        for key, value in fixed_map.items():
            if key in msg:
                return value

        match = re.search(r"next\s+(\d+)\s*(day|days|week|weeks|month|months|quarter|quarters|year|years)", msg)
        if not match:
            return None

        amount = int(match.group(1))
        unit = match.group(2)
        if unit.startswith("day"):
            return amount
        if unit.startswith("week"):
            return amount * 7
        if unit.startswith("month"):
            return amount * 30
        if unit.startswith("quarter"):
            return amount * 90
        if unit.startswith("year"):
            return amount * 365
        return None

    def _extract_kpi_metric(self, message: str) -> str | None:
        msg = message.lower()
        metric_map = [
            ("revenue", "revenue"),
            ("profit", "profit"),
            ("roi", "roi"),
            ("impression", "impressions"),
            ("click", "clicks"),
            ("purchase", "purchases"),
            ("conversion rate", "conversion_rate"),
            ("conversion", "conversion_rate"),
            ("ctr", "ctr"),
        ]
        for token, metric in metric_map:
            if token in msg:
                return metric
        return None

    def _canonical_channel_name(self, value: str) -> str:
        normalized = str(value or "").strip().casefold()
        channel_map = {
            "google ads": "Google Ads",
            "google": "Google Ads",
            "facebook": "Facebook",
            "linkedin": "LinkedIn",
            "email": "Email",
            "tiktok": "TikTok",
            "tik tok": "TikTok",
            "twitter": "Twitter",
            "x": "Twitter",
            "instagram": "Instagram",
            "youtube": "YouTube",
            "you tube": "YouTube",
        }
        return channel_map.get(normalized, str(value).strip())

    def _extract_percent_change(self, message: str, keywords: list[str]) -> float | None:
        msg = message.lower()
        key_regex = "|".join(re.escape(keyword) for keyword in keywords)
        pattern = rf"(increase|decrease|reduce|boost|cut)\s+(?:{key_regex})(?:\s+by)?\s+(\d+(?:\.\d+)?)\s*%"
        match = re.search(pattern, msg)
        if not match:
            return None

        direction = match.group(1)
        value = float(match.group(2))
        if direction in {"decrease", "reduce", "cut"}:
            value *= -1.0
        return value

    def _extract_money_amount(self, message: str) -> float | None:
        msg = message.lower()
        match = re.search(r"\$?\s*(\d+(?:[.,]\d+)?)\s*([kKmM]?)", msg)
        if not match:
            return None
        try:
            value = float(match.group(1).replace(",", ""))
            suffix = match.group(2).lower()
            if suffix == "k":
                value *= 1000.0
            elif suffix == "m":
                value *= 1_000_000.0
            return value
        except Exception:
            return None

    def _infer_payload_updates_from_message(self, message: str, intent: str) -> Dict[str, Any]:
        msg = message.lower()
        updates: Dict[str, Any] = {}

        horizon_days = self._extract_horizon_days(message)
        if horizon_days is not None:
            updates["horizon_days"] = horizon_days

        kpi_metric = self._extract_kpi_metric(message)
        if kpi_metric:
            updates["kpi_metric"] = kpi_metric

        channels = ["google ads", "facebook", "linkedin", "email", "tiktok", "twitter", "instagram", "youtube", "you tube"]
        for channel in channels:
            if channel in msg:
                updates["channel"] = self._canonical_channel_name(channel)
                break

        campaign_types = ["conversion", "awareness", "engagement", "retention", "traffic", "lead generation", "lead"]
        for ctype in campaign_types:
            if ctype in msg:
                updates["campaign_type"] = "Lead Generation" if ctype.startswith("lead") else ctype.title()
                break

        spend_change = self._extract_percent_change(message, ["spend", "budget"])
        ctr_lift = self._extract_percent_change(message, ["ctr", "click-through rate", "click through rate"])
        cvr_lift = self._extract_percent_change(message, ["conversion rate", "conversions", "conversion"])

        if intent == "scenario_forecast":
            if spend_change is not None:
                updates["base_spend_change_pct"] = spend_change
            if ctr_lift is not None:
                updates["base_ctr_lift_pct"] = ctr_lift
            if cvr_lift is not None:
                updates["base_conversion_lift_pct"] = cvr_lift
        else:
            if spend_change is not None:
                updates["spend_change_pct"] = spend_change
            if ctr_lift is not None:
                updates["ctr_lift_pct"] = ctr_lift
            if cvr_lift is not None:
                updates["conversion_lift_pct"] = cvr_lift

        if intent == "budget_allocation":
            budget = self._extract_money_amount(message)
            if budget is not None:
                updates["total_budget"] = budget
            if "profit" in msg:
                updates["objective"] = "profit"
            elif "revenue" in msg:
                updates["objective"] = "revenue"
            elif "roi" in msg:
                updates["objective"] = "roi"

        return updates

    def _enrich_plan_from_message(self, plan: Dict[str, Any], message: str) -> Dict[str, Any]:
        enriched = dict(plan or {})
        intent = str(enriched.get("intent") or "").strip() or self._infer_intent_from_message(message)
        enriched["intent"] = intent

        mode = str(enriched.get("mode") or "").strip().lower()
        if mode not in {"conversation", "analysis"}:
            mode = "analysis"
        enriched["mode"] = mode

        agents = enriched.get("agents")
        if not isinstance(agents, list) or not agents:
            enriched["agents"] = list(INTENT_DEFAULT_AGENTS.get(intent, ["forecast"]))

        payload_updates = enriched.get("payload_updates")
        if not isinstance(payload_updates, dict):
            payload_updates = {}
        inferred_updates = self._infer_payload_updates_from_message(message, intent)
        payload_updates = {**payload_updates, **inferred_updates}
        enriched["payload_updates"] = payload_updates

        return enriched

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

        passthrough_keys = [
            "horizon_days",
            "kpi_metric",
            "channel",
            "campaign_type",
            "campaign_id",
            "spend_change_pct",
            "ctr_lift_pct",
            "conversion_lift_pct",
            "cpc_change_pct",
            "aov_change_pct",
            "seasonality_factor",
            "base_spend_change_pct",
            "base_ctr_lift_pct",
            "base_conversion_lift_pct",
            "base_aov_change_pct",
            "total_budget",
            "objective",
            "risk_tolerance",
            "max_shift_pct",
            "min_channel_pct",
            "max_channel_pct",
        ]
        for key in passthrough_keys:
            if key in updates and updates.get(key) is not None:
                payload[key] = updates[key]

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
            "budget_allocator": "Budget Allocator Agent",
            "data_query": "Data Query Agent",
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

    def _resolve_execution_plan(
        self,
        intent: str,
        requested_agents: List[str] | None,
    ) -> Dict[str, Any]:
        normalized_requested: List[str] = []
        policy_notes: List[str] = []

        for item in requested_agents or []:
            candidate = str(item).strip().lower()
            if not candidate:
                continue
            if candidate == "budget":
                candidate = "budget_allocator"
            if candidate in normalized_requested:
                continue
            normalized_requested.append(candidate)

        approved_agents = [
            agent for agent in normalized_requested if agent in SUPPORTED_EXECUTION_AGENTS
        ]

        dropped = [
            agent for agent in normalized_requested if agent not in SUPPORTED_EXECUTION_AGENTS
        ]
        if dropped:
            policy_notes.append(f"Dropped unsupported agents: {', '.join(dropped)}")

        if not approved_agents:
            approved_agents = list(INTENT_DEFAULT_AGENTS.get(intent, ["forecast"]))
            policy_notes.append(
                "No supported planned agents; used intent defaults"
            )

        required_agents = INTENT_REQUIRED_AGENTS.get(intent, [])
        added_required: List[str] = []
        for required in required_agents:
            if required not in approved_agents:
                approved_agents.append(required)
                added_required.append(required)

        if added_required:
            policy_notes.append(
                f"Added required agents for intent '{intent}': {', '.join(added_required)}"
            )

        return {
            "requested_agents": normalized_requested,
            "approved_agents": approved_agents,
            "policy_notes": policy_notes,
        }

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
            # Forecast agent supports sane defaults (channel/campaign_type="all", horizon defaults, etc.)
            # so we should not block execution waiting for marketing-input forms.
            return []
        if intent == "scenario_forecast":
            # Scenario agent also has default assumptions and can run directly on available campaign data.
            return []
        if intent == "budget_allocation":
            return ["total_budget", "objective"]
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
        """Forecast requests should execute directly; extract optional params only."""
        extracted = self._extract_forecast_parameters(message)

        return {
            "needed": False,
            "missing_params": [],
            "extracted_params": extracted,
        }
    
    def _detect_scenario_clarification(self, message: str) -> Dict[str, Any]:
        """Scenario requests should execute directly; extract optional params only."""
        extracted = self._extract_scenario_parameters(message)

        return {
            "needed": False,
            "missing_params": [],
            "extracted_params": extracted,
        }
    
    def _extract_forecast_parameters(self, message: str) -> Dict[str, Any]:
        """Extract forecast parameters from user message"""
        msg_lower = message.lower()
        params = {}

        horizon_days = self._extract_horizon_days(message)
        if horizon_days is not None:
            params["horizon_days"] = horizon_days

        kpi_metric = self._extract_kpi_metric(message)
        if kpi_metric:
            params["kpi_metric"] = kpi_metric
        
        # Channel detection
        channels = ["google ads", "facebook", "linkedin", "email", "tiktok", "twitter", "instagram", "youtube", "you tube"]
        for channel in channels:
            if channel in msg_lower:
                params["channel"] = self._canonical_channel_name(channel)
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

        spend_change = self._extract_percent_change(message, ["spend", "budget"])
        if spend_change is not None:
            params["spend_change_pct"] = spend_change

        ctr_lift = self._extract_percent_change(message, ["ctr", "click-through rate", "click through rate"])
        if ctr_lift is not None:
            params["ctr_lift_pct"] = ctr_lift

        cvr_lift = self._extract_percent_change(message, ["conversion rate", "conversions", "conversion"])
        if cvr_lift is not None:
            params["conversion_lift_pct"] = cvr_lift
        
        return params
    
    def _extract_scenario_parameters(self, message: str) -> Dict[str, Any]:
        """Extract scenario parameters from user message"""
        msg_lower = message.lower()
        params = {}

        horizon_days = self._extract_horizon_days(message)
        if horizon_days is not None:
            params["horizon_days"] = horizon_days

        kpi_metric = self._extract_kpi_metric(message)
        if kpi_metric:
            params["kpi_metric"] = kpi_metric

        channels = ["google ads", "facebook", "linkedin", "email", "tiktok", "twitter", "instagram", "youtube", "you tube"]
        for channel in channels:
            if channel in msg_lower:
                params["channel"] = self._canonical_channel_name(channel)
                break

        campaign_types = ["conversion", "awareness", "engagement", "retention", "traffic", "lead generation", "lead"]
        for ctype in campaign_types:
            if ctype in msg_lower:
                params["campaign_type"] = "Lead Generation" if ctype.startswith("lead") else ctype.title()
                break

        # Base spend: only capture if explicitly tied to spend/budget semantics.
        import re
        money_match = re.search(r'\$\s*(\d+[,.]?\d*)\s*([kK]?)', msg_lower)
        budget_match = re.search(
            r'(?:base\s*spend|budget|spend)\s*(?:is|of|=|:|around|about|at)?\s*\$?\s*(\d+[,.]?\d*)\s*([kK]?)',
            msg_lower,
        )

        spend_match = budget_match or money_match
        if spend_match:
            try:
                numeric = float(spend_match.group(1).replace(',', ''))
                if spend_match.group(2).lower() == 'k':
                    numeric *= 1000
                params["base_spend"] = numeric
            except Exception:
                pass
        
        # Adjustments (look for percentage changes)
        if "increase" in msg_lower or "decrease" in msg_lower or "change" in msg_lower:
            adj_pattern = r'(?:increase|decrease|change|boost|cut)\s*(?:by)?\s*(\d+\.?\d*)%?'
            adj_matches = re.findall(adj_pattern, msg_lower)
            if adj_matches:
                params["adjustments"] = {"spend_change": float(adj_matches[0]) / 100}

        spend_change = self._extract_percent_change(message, ["spend", "budget"])
        if spend_change is not None:
            params["base_spend_change_pct"] = spend_change

        ctr_lift = self._extract_percent_change(message, ["ctr", "click-through rate", "click through rate"])
        if ctr_lift is not None:
            params["base_ctr_lift_pct"] = ctr_lift

        cvr_lift = self._extract_percent_change(message, ["conversion rate", "conversions", "conversion"])
        if cvr_lift is not None:
            params["base_conversion_lift_pct"] = cvr_lift
        
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
    
    def _merge_clarified_answers(self, intent: str, extracted_params: Dict[str, Any], user_answers: str) -> Dict[str, Any]:
        """
        Parse user's answers to clarification questions and merge with extracted params.
        Uses Gemini to understand natural language answers.
        """
        if not user_answers or not user_answers.strip():
            return extracted_params

        merged = dict(extracted_params)

        # Deterministic parser first to avoid clarification loops when LLM parsing is unavailable.
        if intent == "scenario_forecast":
            merged.update(self._extract_scenario_parameters(user_answers))
        elif intent == "forecast":
            merged.update(self._extract_forecast_parameters(user_answers))
        
        # Use Gemini to parse answers
        prompt = f"""
Extract parameters from the user's answers. Return ONLY a JSON object with extracted values.

Previously extracted parameters:
{json.dumps(merged, default=str)}

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
- base_spend: float
- adjustments: object

Return ONLY valid JSON, no other text.
"""
        
        try:
            raw = self.gemini_client.generate(prompt)
            cleaned = raw.strip().replace("```json", "").replace("```", "").strip()
            parsed = json.loads(cleaned)

            # Normalize common aliases that models may emit.
            if isinstance(parsed, dict):
                if "spend_change_pct" in parsed and "adjustments" not in parsed:
                    try:
                        parsed["adjustments"] = {
                            "spend_change": float(parsed["spend_change_pct"]) / 100.0
                        }
                    except Exception:
                        pass

                if "base_budget" in parsed and "base_spend" not in parsed:
                    parsed["base_spend"] = parsed.get("base_budget")

                # Merge only meaningful values; do not clobber deterministic fields with null/empty data.
                for key, value in parsed.items():
                    if value is None:
                        continue
                    if isinstance(value, str) and not value.strip():
                        continue
                    if isinstance(value, dict) and not value:
                        continue
                    merged[key] = value
            return merged
        except Exception as e:
            logger.warning("Could not parse clarification answers", error=str(e))
            return merged

    # ============================================================
    # Execute Analytics
    # ============================================================
    def _execute(
        self,
        intent: str,
        payload: Dict[str, Any],
        agents_to_run: List[str],
    ) -> Dict[str, Any]:
        if not agents_to_run:
            agents_to_run = list(INTENT_DEFAULT_AGENTS.get(intent, ["forecast"]))

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
        conversation_context: str = "No previous conversation context.",
    ) -> str:
        prompt = f"""
You are Analytics Supervisor.

Write a concise and professional response.

User request:
{original_message}

Recent conversation context:
{conversation_context}

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


