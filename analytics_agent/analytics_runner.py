from __future__ import annotations

from typing import Any, Dict, List

from analytics_agent.state import AnalyticsState
from analytics_agent.graph import build_graph, CAPABILITIES
from analytics_agent.clients.gemini_client import GeminiClient
from analytics_agent.logging_config import get_logger

logger = get_logger(__name__)


class AnalyticsRunner:
    def __init__(self):
        try:
            self.graph = build_graph()
            self.capabilities = CAPABILITIES
            self.gemini = GeminiClient()
            logger.info("AnalyticsRunner initialized successfully")
        except Exception as e:
            logger.error(
                "Failed to initialize AnalyticsRunner",
                error=str(e),
            )
            raise

    def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the full analytics pipeline with comprehensive error handling."""
        try:
            if not isinstance(payload, dict):
                raise ValueError("Payload must be a dictionary")

            logger.info(
                "Starting analytics run",
                payload_keys=list(payload.keys()),
            )

            state = AnalyticsState(**payload)
            logger.debug("AnalyticsState created successfully")

            raw_result = self.graph.invoke(state)

            if isinstance(raw_result, AnalyticsState):
                result = raw_result
            elif isinstance(raw_result, dict):
                result = AnalyticsState(**raw_result)
            else:
                raise TypeError(
                    f"Graph invocation returned unexpected type: {type(raw_result)}"
                )

            logger.info("Graph execution completed successfully")

            summary = ""
            if self.gemini.enabled:
                try:
                    prompt = (
                        "You are a Growth Analyst. "
                        "Create a concise plain-English summary of the forecast, "
                        "key scenarios, and the confidence level. "
                        "Avoid inventing numbers; only explain.\n\n"
                        f"Primary KPI: {result.primary_kpi}\n"
                        f"Metrics: {result.metrics}\n"
                        f"Confidence Score: {result.confidence_score}"
                    )
                    summary = self.gemini.generate(prompt)
                    logger.debug("AI summary generated successfully")
                except Exception as e:
                    logger.warning(
                        "Failed to generate AI summary",
                        error=str(e),
                    )
                    summary = "AI summary unavailable due to service error."

            response = {
                "capabilities": self.capabilities,
                "primary_kpi": result.primary_kpi,
                "metrics": result.metrics,
                "forecast_results": (
                    result.forecast_results.model_dump()
                    if result.forecast_results is not None
                    else {}
                ),
                "scenarios": [
                    scenario.model_dump()
                    for scenario in (result.scenarios or [])
                ],
                "cohort_results": result.cohort_results,
                "funnel_model": (
                    result.funnel_model.model_dump()
                    if result.funnel_model is not None
                    else {}
                ),
                "attribution_model": (
                    result.attribution_model.model_dump()
                    if result.attribution_model is not None
                    else {}
                ),
                "assumptions": result.assumptions,
                "confidence_score": result.confidence_score,
                "suggestions": [
                    suggestion.model_dump()
                    for suggestion in (result.suggestions_list or [])
                ],
                "warnings": result.warnings,
                "reasoning_summary": summary,
            }

            logger.info(
                "Analytics run completed successfully",
                confidence_score=result.confidence_score,
                scenarios_count=len(result.scenarios or []),
            )

            return response

        except Exception as e:
            logger.error(
                "Analytics run failed",
                error=str(e),
                payload_keys=list(payload.keys()) if isinstance(payload, dict) else None,
            )
            raise RuntimeError(f"Analytics pipeline failed: {str(e)}") from e

    def budget_sensitivity(
        self,
        base_payload: Dict[str, Any],
        budgets: List[float],
    ) -> List[Dict[str, Any]]:
        """Analyze ROI across different budget levels."""
        try:
            if not budgets:
                raise ValueError("Budgets must be a non-empty list")

            logger.info(
                "Starting budget sensitivity analysis",
                budget_count=len(budgets),
            )

            results: List[Dict[str, Any]] = []

            for budget in budgets:
                try:
                    if not isinstance(budget, (int, float)) or budget <= 0:
                        raise ValueError(
                            f"Budget must be a positive number, got: {budget}"
                        )

                    payload = dict(base_payload)
                    channels = dict(payload.get("channel_performance", {}))

                    total_spend = sum(
                        float(channel.get("spend", 0.0))
                        for channel in channels.values()
                    )

                    if total_spend <= 0:
                        raise ValueError(
                            "Total existing channel spend must be greater than zero"
                        )

                    scale_factor = budget / total_spend

                    for channel_name, channel_data in channels.items():
                        updated_channel = dict(channel_data)
                        updated_channel["spend"] = (
                            float(updated_channel.get("spend", 0.0)) * scale_factor
                        )
                        channels[channel_name] = updated_channel

                    payload["channel_performance"] = channels

                    analysis = self.run(payload)

                    results.append(
                        {
                            "budget": budget,
                            "roas": analysis["metrics"].get("roas", 0.0),
                            "revenue": analysis["forecast_results"]
                            .get("totals", {})
                            .get("revenue", 0.0),
                            "profit": analysis["forecast_results"]
                            .get("totals", {})
                            .get("profit", 0.0),
                        }
                    )

                except Exception as e:
                    logger.error(
                        "Failed to analyze budget scenario",
                        budget=budget,
                        error=str(e),
                    )
                    results.append(
                        {
                            "budget": budget,
                            "error": str(e),
                        }
                    )

            logger.info(
                "Budget sensitivity analysis completed",
                successful_scenarios=len(
                    [item for item in results if "error" not in item]
                ),
            )

            return results

        except Exception as e:
            logger.error(
                "Budget sensitivity analysis failed",
                error=str(e),
            )
            raise RuntimeError(
                f"Budget sensitivity analysis failed: {str(e)}"
            ) from e

    def break_even(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate minimum metrics needed for profitability."""
        try:
            logger.info("Starting break-even analysis")

            metrics = self.run(payload)["metrics"]

            variable_cogs_rate = float(
                payload.get("cost_structure", {}).get(
                    "variable_cogs_rate",
                    0.0,
                )
            )
            cac = float(metrics.get("cac", 0.0))
            cpc = float(
                payload.get("structured_context", {}).get("cpc", 0.5)
            )
            ctr = float(
                payload.get("conversion_rates", {}).get("ctr", 0.015)
            )

            min_roas = 1.0 + variable_cogs_rate
            min_cvr = (cpc / (cac * ctr)) if cac > 0 and ctr > 0 else 0.0

            result = {
                "min_roas": round(min_roas, 3),
                "min_cvr": round(min_cvr, 4),
                "notes": "Deterministic break-even calculation",
            }

            logger.info(
                "Break-even analysis completed",
                min_roas=result["min_roas"],
                min_cvr=result["min_cvr"],
            )

            return result

        except Exception as e:
            logger.error(
                "Break-even analysis failed",
                error=str(e),
            )
            raise RuntimeError(f"Break-even analysis failed: {str(e)}") from e

    def ltv_projection(
        self,
        payload: Dict[str, Any],
        months: int = 12,
    ) -> Dict[str, Any]:
        """Project customer lifetime value over time."""
        try:
            if months <= 0:
                raise ValueError("Months must be a positive integer")

            logger.info("Starting LTV projection", months=months)

            aov = float(payload.get("revenue_data", {}).get("aov", 0.0))
            new_customers = float(
                payload.get("structured_context", {}).get("new_customers", 0.0)
            )
            repeat_rate = float(
                payload.get("structured_context", {}).get(
                    "repeat_purchase_rate",
                    0.2,
                )
            )

            monthly_revenue = []
            current_customers = new_customers
            total_ltv = 0.0

            for _ in range(months):
                revenue = current_customers * aov
                monthly_revenue.append(round(revenue, 2))
                total_ltv += revenue
                current_customers *= repeat_rate

            result = {
                "monthly_revenue": monthly_revenue,
                "total_ltv": round(total_ltv, 2),
                "assumptions": [
                    f"Repeat purchase rate: {repeat_rate:.1%}",
                    f"Average order value: {aov}",
                ],
            }

            logger.info(
                "LTV projection completed",
                total_ltv=result["total_ltv"],
            )

            return result

        except Exception as e:
            logger.error(
                "LTV projection failed",
                error=str(e),
            )
            raise RuntimeError(f"LTV projection failed: {str(e)}") from e

    def cfo_mode(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Generate executive summary for leadership stakeholders."""
        try:
            logger.info("Starting CFO mode analysis")

            result = self.run(payload)

            revenue = (
                result.get("forecast_results", {})
                .get("totals", {})
                .get("revenue", 0)
            )
            roas = result.get("metrics", {}).get("roas", 0)
            confidence = result.get("confidence_score", 0)

            executive_summary = (
                f"Executive Summary: Forecast revenue is {revenue:,.0f}, "
                f"expected ROAS is {roas:.2f}, and confidence is {confidence:.0f}%."
            )

            board_explanation = ""
            if self.gemini.enabled:
                try:
                    prompt = (
                        "You are a CFO preparing a board update. "
                        "Write a concise explanation of the forecast, key risks, "
                        "and recommended next actions. Avoid inventing numbers.\n\n"
                        f"Revenue: {revenue}\n"
                        f"ROAS: {roas}\n"
                        f"Confidence: {confidence}"
                    )
                    board_explanation = self.gemini.generate(prompt)
                except Exception as e:
                    logger.warning(
                        "Failed to generate board explanation",
                        error=str(e),
                    )
                    board_explanation = (
                        "Board explanation unavailable due to service error."
                    )

            logger.info("CFO mode analysis completed")

            return {
                "executive_summary": executive_summary,
                "board_explanation": board_explanation,
            }

        except Exception as e:
            logger.error(
                "CFO mode analysis failed",
                error=str(e),
            )
            raise RuntimeError(f"CFO mode analysis failed: {str(e)}") from e

