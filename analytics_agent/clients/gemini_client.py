# analytics_agent/clients/gemini_client.py

from __future__ import annotations

import os
from typing import Optional

from dotenv import load_dotenv

from analytics_agent.logging_config import get_logger

try:
    from google import genai
except Exception:
    genai = None

try:
    import google.generativeai as legacy_genai
except Exception:
    legacy_genai = None

load_dotenv()

logger = get_logger(__name__)

MODEL_NAME = "gemini-3-flash-preview"


class GeminiClient:
    def __init__(self, api_key: Optional[str] = None):
        api_key = api_key or os.getenv("GEMINI_API_KEY")
        print("GEMINI KEY PREFIX:", api_key[:20] if api_key else "NO KEY")
        self._mode = None

        if not api_key:
            logger.warning("GEMINI_API_KEY not found. Gemini client disabled.")
            self.enabled = False
            self._client = None
            return

        try:
            if genai is not None:
                self._client = genai.Client(api_key=api_key)
                self._mode = "google-genai"
                self.enabled = True
                logger.info("Gemini client initialized", model=MODEL_NAME, sdk=self._mode)
                return

            if legacy_genai is not None:
                legacy_genai.configure(api_key=api_key)
                self._client = legacy_genai.GenerativeModel(MODEL_NAME)
                self._mode = "google-generativeai"
                self.enabled = True
                logger.info("Gemini client initialized", model=MODEL_NAME, sdk=self._mode)
                return

            logger.warning(
                "No compatible Gemini SDK installed (google-genai/google-generativeai). Gemini client disabled."
            )
            self.enabled = False
            self._client = None
        except Exception as e:
            logger.error("Failed to initialize Gemini client", error=str(e))
            self.enabled = False
            self._client = None

    def generate(self, prompt: str, model: Optional[str] = None) -> str:
        """
        Generate content. Returns a non-empty string on success.
        Raises RuntimeError on empty response or API failure so that
        LLMClient can trigger its fallback chain.
        """
        if not self.enabled or self._client is None:
            raise RuntimeError("Gemini client is not enabled")

        target_model = model or MODEL_NAME

        try:
            if self._mode == "google-genai":
                response = self._client.models.generate_content(
                    model=target_model,
                    contents=prompt,
                )

                if hasattr(response, "text") and response.text:
                    return response.text.strip()

            elif self._mode == "google-generativeai":
                if model and model != MODEL_NAME:
                    temp_model = legacy_genai.GenerativeModel(target_model)
                    response = temp_model.generate_content(prompt)
                else:
                    response = self._client.generate_content(prompt)
                text = getattr(response, "text", None)
                if text:
                    return text.strip()

            raise RuntimeError("Gemini returned an empty response")

        except RuntimeError:
            raise
        except Exception as e:
            logger.error(
                "Error generating content with Gemini",
                error=str(e),
                model=target_model,
            )
            raise RuntimeError(f"Gemini API error: {e}") from e