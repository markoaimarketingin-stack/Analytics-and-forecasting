from __future__ import annotations
from typing import Any, Dict
from analytics_agent.state import AnalyticsState
from analytics_agent.graph import build_graph, CAPABILITIES
from analytics_agent.clients.gemini_client import GeminiClient


class AnalyticsRunner:
    def __init__(self):
        self.graph = build_graph()
        self.capabilities = CAPABILITIES
        self.gemini = GeminiClient()

    def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        state = AnalyticsState(**payload)
        result: AnalyticsState = self.graph.invoke(state)

        # Produce friendly explanation via Gemini for non-numeric reasoning
        summary = ""
        if self.gemini.enabled:
            prompt = (
                "You are a Growth Analyst. Create a concise plain-English summary of the forecast, "
                "key scenarios, and the confidence level. Avoid inventing numbers; only explain."
            )
            summary = self.gemini.generate(prompt)

        return {
            "capabilities": self.capabilities,
            "primary_kpi": result.primary_kpi,
            "metrics": result.metrics,
            "forecast_results": result.forecast_results.model_dump(),
            "scenarios": [r.model_dump() for r in result.scenarios],
            "cohort_results": result.cohort_results,
            "funnel_model": result.funnel_model.model_dump(),
            "attribution_model": result.attribution_model.model_dump(),
            "assumptions": result.assumptions,
            "confidence_score": result.confidence_score,
            "suggestions": [s.model_dump() for s in result.suggestions_list],
            "warnings": result.warnings,
            "reasoning_summary": summary,
        }

    def budget_sensitivity(self, base_payload: Dict[str, Any], budgets: list[float]):
        out = []
        for b in budgets:
            tmp = dict(base_payload)
            # scale spend across channels proportionally
            ch = tmp.get("channel_performance", {})
            total = sum(float(v.get("spend", 0.0)) for v in ch.values()) or 1.0
            scale = b / total
            for k in ch.keys():
                ch[k]["spend"] = float(ch[k].get("spend", 0.0)) * scale
            tmp["channel_performance"] = ch
            res = self.run(tmp)
            out.append(
                {
                    "budget": b,
                    "roas": res["metrics"].get("roas", 0.0),
                    "revenue": res["forecast_results"]["totals"].get("revenue", 0.0),
                    "profit": res["forecast_results"]["totals"].get("profit", 0.0),
                }
            )
        return out

    def break_even(self, payload: Dict[str, Any]):
        metrics = self.run(payload)["metrics"]
        ltv = float(metrics.get("ltv", 0.0))
        variable_cogs_rate = float(payload.get("cost_structure", {}).get("variable_cogs_rate", 0.0))
        cac = float(metrics.get("cac", 0.0))
        # min roas to cover spend + cogs
        # revenue = roas * spend; profit >= 0 => roas >= 1 + cogs_rate
        min_roas = 1.0 + variable_cogs_rate
        # derive min conversion rate to achieve given CAC, if cpc and ctr given
        cpc = float(payload.get("structured_context", {}).get("cpc", 0.5))
        ctr = float(payload.get("conversion_rates", {}).get("ctr", 0.015))
        min_cvr = (cpc / (cac * ctr)) if cac and ctr else 0.0
        return {"min_roas": round(min_roas, 3), "min_cvr": round(min_cvr, 4), "notes": "Deterministic calculation"}

    def ltv_projection(self, payload: Dict[str, Any], months: int = 12):
        aov = float(payload.get("revenue_data", {}).get("aov", 0.0))
        new_customers = float(payload.get("structured_context", {}).get("new_customers", 0.0))
        repeat = float(payload.get("structured_context", {}).get("repeat_purchase_rate", 0.2))
        monthly = []
        current = new_customers
        total = 0.0
        for m in range(months):
            rev = current * aov
            monthly.append(round(rev, 2))
            total += rev
            current *= repeat
        return {"monthly_revenue": monthly, "total_ltv": round(total, 2), "assumptions": [f"Repeat={repeat*100:.1f}%", f"AOV={aov}"]}

    def cfo_mode(self, payload: Dict[str, Any]):
        res = self.run(payload)
        summary = (
            f"Executive summary: Next-period revenue {res['forecast_results']['totals'].get('revenue', 0):,.0f}, "
            f"Base ROAS {res['metrics'].get('roas', 0):.2f}, Confidence {res['confidence_score']:.0f}%"
        )
        if self.gemini.enabled:
            prompt = (
                "You are a CFO. Write a board-level explanation with risks and plain-English interpretation. "
                "Do not invent numbers; use placeholders like <value> where unsure."
            )
            text = self.gemini.generate(prompt)
        else:
            text = ""
        return {"executive_summary": summary, "board_explanation": text}
