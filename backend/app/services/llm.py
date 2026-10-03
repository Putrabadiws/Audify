import logging
import re
from dataclasses import dataclass
from typing import Protocol

import httpx

logger = logging.getLogger(__name__)

# Some models (Qwen3 family) still emit a reasoning block even with think=false on older
# Ollama builds; it must never leak into a summary the user reads or exports.
_THINK_BLOCK = re.compile(r"^\s*<think>.*?</think>\s*", re.DOTALL)


class LLMError(Exception):
    """Human-readable failure (shown in the UI as-is)."""


@dataclass
class ChatMessage:
    role: str
    content: str


@dataclass
class LLMStatus:
    reachable: bool
    model: str
    model_installed: bool
    installed_models: list[str]
    error: str | None = None


class LLMClient(Protocol):
    model: str

    def chat(self, messages: list[ChatMessage], num_ctx: int) -> str: ...


def strip_thinking(text: str) -> str:
    return _THINK_BLOCK.sub("", text, count=1).strip()


class OllamaClient:
    """Minimal sync client for Ollama's /api/chat (runs inside the worker thread)."""

    def __init__(self, base_url: str, model: str, timeout_s: float, keep_alive: str):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self._timeout = httpx.Timeout(timeout_s, connect=5.0)
        # Short keep_alive: on an 8 GB machine the LLM must release RAM before Whisper's next job.
        self._keep_alive = keep_alive

    def chat(self, messages: list[ChatMessage], num_ctx: int) -> str:
        payload = {
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": False,
            # thinking doubles latency on CPU-class hardware for no gain in summarization
            "think": False,
            "keep_alive": self._keep_alive,
            "options": {"num_ctx": num_ctx, "temperature": 0.3},
        }
        try:
            res = httpx.post(f"{self.base_url}/api/chat", json=payload, timeout=self._timeout)
        except httpx.ConnectError as exc:
            raise LLMError(
                f"Ollama is not running at {self.base_url}. Start it with `ollama serve`."
            ) from exc
        except httpx.TimeoutException as exc:
            raise LLMError("The AI model took too long to respond. Try a shorter file.") from exc
        if res.status_code == 404:
            raise LLMError(
                f"Model '{self.model}' is not installed. Run `ollama pull {self.model}`."
            )
        if res.status_code >= 400:
            # Ollama returns {"error": "..."}; keep it for the user, it is usually actionable
            detail = res.json().get("error", res.text) if _is_json(res) else res.text
            raise LLMError(f"Ollama error ({res.status_code}): {str(detail)[:300]}")
        content = res.json().get("message", {}).get("content", "")
        return strip_thinking(content)

    def status(self) -> LLMStatus:
        try:
            res = httpx.get(f"{self.base_url}/api/tags", timeout=3.0)
            res.raise_for_status()
        except httpx.HTTPError as exc:
            logger.info("ollama not reachable at %s: %s", self.base_url, exc)
            return LLMStatus(
                False, self.model, False, [], f"Ollama is not running at {self.base_url}"
            )
        names = [m.get("name", "") for m in res.json().get("models", [])]
        # "qwen3:4b" is installed as "qwen3:4b"; a bare "qwen3" means ":latest"
        wanted = self.model if ":" in self.model else f"{self.model}:latest"
        return LLMStatus(True, self.model, wanted in names, names)


def _is_json(res: httpx.Response) -> bool:
    return res.headers.get("content-type", "").startswith("application/json")
