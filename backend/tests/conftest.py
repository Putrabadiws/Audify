import shutil
import subprocess
import time
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.llm import ChatMessage
from app.services.transcriber import ProgressCallback, SegmentData, TranscriptionResult, WordData

requires_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")


class FakeTranscriber:
    """Deterministic stand-in for Whisper; records calls so tests can assert on inputs."""

    model_name = "fake-model"

    def __init__(self, fail_with: Exception | None = None):
        self.calls: list[dict] = []
        self.fail_with = fail_with

    def transcribe(
        self,
        audio_path: Path,
        language: str | None,
        prompt: str | None,
        on_progress: ProgressCallback,
    ) -> TranscriptionResult:
        self.calls.append({"audio_path": audio_path, "language": language, "prompt": prompt})
        if self.fail_with:
            raise self.fail_with
        on_progress(0.5)
        on_progress(1.0)
        return TranscriptionResult(
            language=language or "id",
            duration=2.0,
            segments=[
                SegmentData(0.0, 1.0, "Selamat pagi semua.", [WordData(0.0, 0.5, "Selamat", 0.9)]),
                SegmentData(1.0, 2.0, "Let's review the budget.", []),
            ],
        )


@pytest.fixture
def sample_wav(tmp_path: Path) -> Path:
    path = tmp_path / "sample.wav"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=2",
            str(path),
        ],
        check=True,
    )
    return path


@pytest.fixture
def fake_transcriber() -> FakeTranscriber:
    return FakeTranscriber()


class FakeLLM:
    """Records prompts; answers with a canned summary or raises `fail_with`."""

    model = "fake-llm"

    def __init__(self, answer: str = "## Ringkasan\nRapat membahas budget."):
        self.answer = answer
        self.fail_with: Exception | None = None
        self.calls: list[list[ChatMessage]] = []

    def chat(self, messages: list[ChatMessage], num_ctx: int) -> str:
        self.calls.append(messages)
        if self.fail_with:
            raise self.fail_with
        return self.answer


@pytest.fixture
def fake_llm() -> FakeLLM:
    return FakeLLM()


@pytest.fixture
def client(
    tmp_path: Path, fake_transcriber: FakeTranscriber, fake_llm: FakeLLM
) -> Iterator[TestClient]:
    # ollama_url points at a closed port so /ai/status never touches a real Ollama in tests
    settings = Settings(data_dir=tmp_path / "data", ollama_url="http://127.0.0.1:9")
    app = create_app(settings=settings, transcriber=fake_transcriber, llm_client=fake_llm)
    with TestClient(app) as c:
        yield c


def wait_for_status(
    client: TestClient, job_id: str, statuses: set[str], timeout: float = 15
) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = client.get(f"/api/v1/jobs/{job_id}").json()
        if job["status"] in statuses:
            return job
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} never reached {statuses}")


def upload(client: TestClient, path: Path, **form: str):
    with path.open("rb") as f:
        return client.post("/api/v1/jobs", files={"file": (path.name, f)}, data=form)
