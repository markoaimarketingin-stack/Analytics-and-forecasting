"""
Unified LLM client — Gemini primary, OpenRouter free models fallback.

Usage:
    from analytics_agent.clients.llm_client import LLMClient
    client = LLMClient()
    text = client.generate("Summarise this data: ...")
"""
from __future__ import annotations

from typing import Optional

from analytics_agent.logging_config import get_logger
from analytics_agent.clients.gemini_client import GeminiClient
from analytics_agent.clients.openrouter_client import OpenRouterClient

logger = get_logger(__name__)


class LLMClient:
    """
    Tries Gemini first. If Gemini returns empty or raises, falls back to
    OpenRouter free models.  Accepts optional runtime overrides for the
    custom-model-per-user feature (from the Manage Models modal).
    """

    def __init__(
        self,
        gemini_client: Optional[GeminiClient] = None,
        openrouter_client: Optional[OpenRouterClient] = None,
    ):
        # Re-use existing instances if passed in (e.g. from AnalyticsRunner).
        self._gemini = gemini_client or GeminiClient()
        self._openrouter = openrouter_client or OpenRouterClient()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate(
        self,
        prompt: str,
        *,
        custom_key: Optional[str] = None,
        custom_base_url: Optional[str] = None,
        custom_model: Optional[str] = None,
        custom_provider: Optional[str] = None,
    ) -> str:
        """
        Generate a response for *prompt*.

        If custom_key / custom_model are provided (from user's Manage Models
        config), they bypass the normal Gemini → OpenRouter chain and use the
        user-supplied config directly.
        """

        # ── If user has a custom model configured, use it directly ──────
        if custom_key and custom_model:
            return self._generate_custom(
                prompt=prompt,
                custom_key=custom_key,
                custom_base_url=custom_base_url,
                custom_model=custom_model,
                custom_provider=custom_provider,
            )

        # ── Primary: Gemini ─────────────────────────────────────────────
        if self._gemini.enabled:
            try:
                result = self._gemini.generate(prompt)
                if result:
                    return result
                logger.warning("Gemini returned empty response — trying OpenRouter fallback")
            except Exception as exc:
                logger.warning("Gemini raised an exception — trying OpenRouter fallback", error=str(exc))

        # ── Fallback: OpenRouter free models ────────────────────────────
        try:
            result = self._openrouter.generate(prompt)
            if result:
                return result
        except Exception as exc:
            logger.error("OpenRouter fallback also failed", error=str(exc))

        logger.error("All LLM providers exhausted — returning empty string")
        return ""

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _generate_custom(
        self,
        *,
        prompt: str,
        custom_key: str,
        custom_base_url: Optional[str],
        custom_model: str,
        custom_provider: Optional[str],
    ) -> str:
        """
        Use the user's own API key + model.  Gemini native SDK path is used
        when provider is 'gemini'; otherwise the OpenAI-compatible path
        (which also works for OpenRouter, Anthropic proxy, etc.).
        """
        provider = (custom_provider or "openai").lower()

        if provider == "gemini":
            # Instantiate a fresh Gemini client with the user's key.
            try:
                gc = GeminiClient(api_key=custom_key)
                if gc.enabled:
                    result = gc.generate(prompt)
                    if result:
                        return result
                    logger.warning("Custom Gemini key returned empty — falling back to OpenRouter")
            except Exception as exc:
                logger.warning("Custom Gemini key failed", error=str(exc))
            # Fall through to OpenRouter with user key as backup
            return self._openrouter.generate(
                prompt,
                custom_key=custom_key,
                custom_base_url=custom_base_url,
                custom_model=custom_model,
            )

        # OpenAI-compatible path (OpenAI, OpenRouter, Anthropic, etc.)
        return self._openrouter.generate(
            prompt,
            custom_key=custom_key,
            custom_base_url=custom_base_url,
            custom_model=custom_model,
        )
