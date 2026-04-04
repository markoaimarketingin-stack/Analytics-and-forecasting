# analytics_agent/gemini_client.py

from __future__ import annotations

import os
from typing import Optional

from dotenv import load_dotenv

from analytics_agent.logging_config import get_logger

try:
    from google import genai
except Exception:
    genai = None

load_dotenv()

logger = get_logger(__name__)

MODEL_NAME = "gemini-3.1-flash-lite-preview"


class GeminiClient:
    def __init__(self, api_key: Optional[str] = None):
        api_key = api_key or os.getenv("GEMINI_API_KEY")

        if not api_key:
            logger.warning("GEMINI_API_KEY not found. Gemini client disabled.")
            self.enabled = False
            self._client = None
            return

        if genai is None:
            logger.warning(
                "google-genai package is not installed. Gemini client disabled."
            )
            self.enabled = False
            self._client = None
            return

        try:
            self._client = genai.Client(api_key=api_key)
            self.enabled = True
            logger.info("Gemini client initialized", model=MODEL_NAME)
        except Exception as e:
            logger.error("Failed to initialize Gemini client", error=str(e))
            self.enabled = False
            self._client = None

    def generate(self, prompt: str) -> str:
        if not self.enabled or self._client is None:
            return ""

        try:
            response = self._client.models.generate_content(
                model=MODEL_NAME,
                contents=prompt,
            )

            if hasattr(response, "text") and response.text:
                return response.text.strip()

            logger.warning("Gemini returned empty response")
            return ""

        except Exception as e:
            logger.error(
                "Error generating content with Gemini",
                error=str(e),
                model=MODEL_NAME,
            )
            return ""