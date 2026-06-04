"""
Unified LLM client — Gemini primary, OpenRouter free models fallback.

Usage:
    from analytics_agent.clients.llm_client import LLMClient
    client = LLMClient()
    text = client.generate("Summarise this data: ...")
"""
from __future__ import annotations

from typing import Optional
from contextvars import ContextVar

from analytics_agent.logging_config import get_logger
from analytics_agent.clients.gemini_client import GeminiClient
from analytics_agent.clients.openrouter_client import OpenRouterClient

logger = get_logger(__name__)

# Request-scoped current client_id context variable
current_client_id: ContextVar[Optional[str]] = ContextVar("current_client_id", default=None)

# The fallback models list in priority order.
FALLBACK_MODELS = [
    # --- Google Gemini Tier (Primary direct access) ---
    {"provider": "google", "model": "gemini-3.5-flash"},
    {"provider": "google", "model": "gemini-2.5-flash"},
    {"provider": "google", "model": "gemini-flash-latest"},

    # --- OpenRouter Tier (Secondary fallback access) ---
    {"provider": "openrouter", "model": "openrouter/auto"},
    {"provider": "openrouter", "model": "openai/gpt-oss-120b:free"},
    {"provider": "openrouter", "model": "openrouter/free"},
    {"provider": "openrouter", "model": "deepseek/deepseek-chat-v3-0324"},
]


class LLMClient:
    """
    Tries Gemini models first. If Gemini models return empty or raise, falls back to
    OpenRouter models sequentially. Accepts optional runtime overrides for the
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

    @property
    def enabled(self) -> bool:
        """
        Check if any backend LLM service is enabled.
        """
        return (
            (self._gemini and getattr(self._gemini, "enabled", False)) or
            (self._openrouter and getattr(self._openrouter, "enabled", False))
        )

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
        # Resolve client-scoped overrides dynamically if not explicitly provided
        if not custom_key or not custom_model:
            client_id = current_client_id.get()
            if client_id:
                from analytics_agent.db.repo import get_session
                from analytics_agent.db.models import ApiKeyStore
                session = get_session()
                try:
                    cfg = (
                        session.query(ApiKeyStore)
                        .filter(ApiKeyStore.client_id == client_id)
                        .first()
                    )
                    if cfg and cfg.api_key_encrypted and cfg.label:
                        custom_key = cfg.api_key_encrypted
                        custom_model = cfg.label
                        custom_provider = cfg.provider or "openai"
                        custom_base_url = None
                except Exception as db_err:
                    logger.warning("Failed to load client LLM overrides from database", client_id=client_id, error=str(db_err))
                finally:
                    session.close()

        # ── If user has a custom model configured, use it directly ──────
        if custom_key and custom_model:
            return self._generate_custom(
                prompt=prompt,
                custom_key=custom_key,
                custom_base_url=custom_base_url,
                custom_model=custom_model,
                custom_provider=custom_provider,
            )

        # ── Fallback Chain Loop ──────────────────────────────────────────
        for model_entry in FALLBACK_MODELS:
            provider = model_entry["provider"]
            model_name = model_entry["model"]

            if provider == "google":
                if self._gemini.enabled:
                    try:
                        logger.info("Attempting primary direct access with Google Gemini model", model=model_name)
                        result = self._gemini.generate(prompt, model=model_name)
                        if result:
                            return result
                        logger.warning("Google Gemini model returned empty response — trying next fallback", model=model_name)
                    except Exception as exc:
                        logger.warning("Google Gemini model failed — trying next fallback", model=model_name, error=str(exc))

            elif provider == "openrouter":
                if self._openrouter.enabled:
                    try:
                        logger.info("Attempting fallback access via OpenRouter with model", model=model_name)
                        result = self._openrouter.generate(prompt, custom_model=model_name)
                        if result:
                            return result
                        logger.warning("OpenRouter model returned empty response — trying next fallback", model=model_name)
                    except Exception as exc:
                        logger.warning("OpenRouter model failed — trying next fallback", model=model_name, error=str(exc))

        logger.error("All LLM providers and fallback models exhausted — returning empty string")
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
