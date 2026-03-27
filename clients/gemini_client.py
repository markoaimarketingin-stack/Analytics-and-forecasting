from __future__ import annotations
import os
from typing import Optional

try:
    import google.generativeai as genai
except Exception:  # pragma: no cover
    genai = None


MODEL_NAME = "gemini-2.5-pro"


class GeminiClient:
    def __init__(self, api_key: Optional[str] = None):
        api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not api_key:
            self.enabled = False
            self._model = None
            return
        if genai is None:
            self.enabled = False
            self._model = None
            return
        genai.configure(api_key=api_key)
        self._model = genai.GenerativeModel(MODEL_NAME)
        self.enabled = True

    def generate(self, prompt: str) -> str:
        if not self.enabled or self._model is None:
            return ""
        resp = self._model.generate_content(prompt)
        return resp.text or ""
