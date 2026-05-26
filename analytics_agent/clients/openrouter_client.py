"""
OpenRouter LLM client — used as a free fallback when Gemini is unavailable.

Free models are tried in priority order until one returns a valid response.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Optional

from analytics_agent.logging_config import get_logger

logger = get_logger(__name__)

# Best free models on OpenRouter, in priority order.
FREE_MODEL_PRIORITY: list[str] = [
    "openai/gpt-oss-120b",
    "deepseek/deepseek-chat-v3-0324",
    "meta-llama/llama-3.3-70b-instruct",
]

OPENROUTER_API_BASE = "https://openrouter.ai/api/v1"


class OpenRouterClient:
    """
    Thin client around the OpenRouter /chat/completions endpoint.
    Tries the free model priority list until a non-empty response is received.
    Supports a custom API key, base URL, and model override for user-supplied config.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
    ):
        self._api_key = api_key or os.getenv("OPENROUTER_API_KEY", "")
        self._base_url = (base_url or OPENROUTER_API_BASE).rstrip("/")
        self._model_override = model  # If set, skip the free list and use this model
        self.enabled = bool(self._api_key)

        if not self.enabled:
            logger.info(
                "OpenRouterClient: no API key set — will be used only if custom key is provided at runtime."
            )

    def generate(self, prompt: str, *, custom_key: Optional[str] = None,
                 custom_base_url: Optional[str] = None, custom_model: Optional[str] = None) -> str:
        """
        Generate a response for the given prompt.
        Returns the response text, or empty string on failure.
        """
        api_key = custom_key or self._api_key
        if not api_key:
            return ""

        base_url = (custom_base_url or self._base_url).rstrip("/")
        models_to_try = [custom_model] if custom_model else (
            [self._model_override] if self._model_override else FREE_MODEL_PRIORITY
        )

        for model in models_to_try:
            try:
                result = self._call_model(
                    api_key=api_key,
                    base_url=base_url,
                    model=model,
                    prompt=prompt,
                )
                if result:
                    logger.info("OpenRouter responded", model=model)
                    return result
                logger.warning("OpenRouter returned empty response", model=model)
            except Exception as exc:
                logger.warning("OpenRouter model failed, trying next", model=model, error=str(exc))

        logger.error("All OpenRouter models failed for this prompt")
        return ""

    def _call_model(self, *, api_key: str, base_url: str, model: str, prompt: str) -> str:
        """
        Make a single OpenAI-compatible /chat/completions request.
        Uses urllib to avoid adding the httpx/openai dependency.
        """
        url = f"{base_url}/chat/completions"
        payload = {
            "model": model,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 4096,
            "temperature": 0.3,
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url=url,
            data=data,
            method="POST",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://markoai.com",
                "X-Title": "Marko Analytics Agent",
            },
        )

        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read().decode("utf-8"))

        choices = body.get("choices") or []
        if not choices:
            return ""

        message = choices[0].get("message") or {}
        content = message.get("content") or ""
        return content.strip()
