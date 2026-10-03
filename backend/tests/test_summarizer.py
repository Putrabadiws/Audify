import httpx
import pytest

from app.services.llm import ChatMessage, LLMError, OllamaClient, strip_thinking
from app.services.summarizer import (
    FINAL_FORMAT,
    Summarizer,
    TranscriptLine,
    chunk_lines,
    render_transcript,
)
from tests.conftest import FakeLLM

LINES = [
    TranscriptLine(0.0, "Selamat pagi semua."),
    TranscriptLine(65.0, "Budget TikTok naik 20%."),
    TranscriptLine(130.0, "Daniel siapkan proposal Jumat."),
]


# ---- strip_thinking -----------------------------------------------------------------------


def test_strip_thinking_removes_leading_block() -> None:
    assert (
        strip_thinking("<think>\nreasoning...\n</think>\n\n## Ringkasan\nOk") == "## Ringkasan\nOk"
    )


def test_strip_thinking_keeps_think_tags_mentioned_mid_text() -> None:
    text = "## Poin\n- Tag <think> dibahas </think> di rapat"
    assert strip_thinking(text) == text


def test_strip_thinking_keeps_text_starting_with_thinking_word() -> None:
    assert strip_thinking("Thinking about Q4: budget naik.") == "Thinking about Q4: budget naik."


# ---- chunking -----------------------------------------------------------------------------


def test_render_transcript_has_timestamps() -> None:
    assert render_transcript(LINES).splitlines()[1] == "[01:05] Budget TikTok naik 20%."


def test_chunk_lines_never_splits_a_segment() -> None:
    chunks = chunk_lines(LINES, max_chars=40)
    assert len(chunks) == 3
    assert chunks[2] == "[02:10] Daniel siapkan proposal Jumat."


def test_chunk_lines_single_chunk_when_it_fits() -> None:
    assert chunk_lines(LINES, max_chars=10_000) == [render_transcript(LINES)]


def test_chunk_lines_oversized_segment_gets_its_own_chunk() -> None:
    long = [TranscriptLine(0, "x" * 100), TranscriptLine(1, "short")]
    chunks = chunk_lines(long, max_chars=50)
    assert len(chunks) == 2 and chunks[0].endswith("x" * 100)


# ---- Summarizer ---------------------------------------------------------------------------


def test_short_transcript_is_one_call_with_final_format() -> None:
    llm = FakeLLM()
    progress: list[float] = []
    out = Summarizer(llm).summarize("Rapat Q4", LINES, progress.append)

    assert out == "## Ringkasan\nRapat membahas budget."
    assert len(llm.calls) == 1
    user = llm.calls[0][1].content
    assert FINAL_FORMAT in user and "Title: Rapat Q4" in user and "[01:05] Budget" in user
    assert progress[-1] == 1.0


def test_long_transcript_maps_each_chunk_then_reduces() -> None:
    # chunk_chars=45 puts each line in its own chunk, while the three tiny notes still fit
    # in one reduce call (no extra merge step)
    llm = FakeLLM(answer="-n")
    progress: list[float] = []
    Summarizer(llm, chunk_chars=45).summarize("t", LINES, progress.append)

    # 3 chunk notes + 1 final
    assert len(llm.calls) == 4
    assert "part 1 of 3" in llm.calls[0][1].content
    assert "### Part 3" in llm.calls[-1][1].content
    assert progress == pytest.approx([0.25, 0.5, 0.75, 1.0])


def test_notes_longer_than_a_chunk_are_merged_first() -> None:
    llm = FakeLLM(answer="n" * 30)  # every note is long relative to chunk_chars=40
    Summarizer(llm, chunk_chars=40).summarize("t", LINES, lambda _: None)
    merge_calls = [c for c in llm.calls if c[1].content.startswith("Merge these meeting notes")]
    assert merge_calls, "expected a pairwise merge before the final call"


def test_empty_transcript_and_empty_answer_raise() -> None:
    with pytest.raises(LLMError, match="empty"):
        Summarizer(FakeLLM()).summarize("t", [], lambda _: None)
    with pytest.raises(LLMError, match="empty answer"):
        Summarizer(FakeLLM(answer="   ")).summarize("t", LINES, lambda _: None)


# ---- OllamaClient (HTTP layer, no real server) -------------------------------------------


def _client() -> OllamaClient:
    return OllamaClient("http://ollama.test", "qwen3.5:4b", timeout_s=5, keep_alive="1m")


def test_ollama_chat_sends_options_and_strips_thinking(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict = {}

    def fake_post(url: str, json: dict, timeout: httpx.Timeout) -> httpx.Response:
        seen.update(url=url, body=json)
        return httpx.Response(200, json={"message": {"content": "<think>x</think>## Hasil"}})

    monkeypatch.setattr(httpx, "post", fake_post)
    out = _client().chat([ChatMessage("user", "hi")], num_ctx=8192)

    assert out == "## Hasil"
    assert seen["url"] == "http://ollama.test/api/chat"
    assert seen["body"]["think"] is False
    assert seen["body"]["options"]["num_ctx"] == 8192
    assert seen["body"]["keep_alive"] == "1m"


def test_ollama_errors_become_actionable_messages(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*_a, **_k):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(httpx, "post", refuse)
    with pytest.raises(LLMError, match="ollama serve"):
        _client().chat([], num_ctx=1)

    monkeypatch.setattr(httpx, "post", lambda *a, **k: httpx.Response(404, json={"error": "nf"}))
    with pytest.raises(LLMError, match="ollama pull qwen3.5:4b"):
        _client().chat([], num_ctx=1)

    monkeypatch.setattr(
        httpx, "post", lambda *a, **k: httpx.Response(500, json={"error": "out of memory"})
    )
    with pytest.raises(LLMError, match="out of memory"):
        _client().chat([], num_ctx=1)


def test_ollama_status(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        httpx,
        "get",
        lambda *a, **k: httpx.Response(
            200,
            json={"models": [{"name": "qwen3.5:4b"}]},
            request=httpx.Request("GET", "http://ollama.test/api/tags"),
        ),
    )
    st = _client().status()
    assert st.reachable and st.model_installed and st.installed_models == ["qwen3.5:4b"]

    def down(*_a, **_k):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(httpx, "get", down)
    st = _client().status()
    assert not st.reachable and st.error
