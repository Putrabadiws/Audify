from pathlib import Path

from fastapi.testclient import TestClient

from app.services.llm import LLMError
from tests.conftest import FakeLLM, requires_ffmpeg, upload, wait_for_status

pytestmark = requires_ffmpeg


def wait_for_summary(client: TestClient, job_id: str, statuses: set[str]) -> dict:
    import time

    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        s = client.get(f"/api/v1/jobs/{job_id}/summary").json()
        if s["status"] in statuses:
            return s
        time.sleep(0.05)
    raise AssertionError(f"summary for {job_id} never reached {statuses}")


def _done_job(client: TestClient, wav: Path) -> str:
    job_id = upload(client, wav).json()["id"]
    wait_for_status(client, job_id, {"done"})
    return job_id


def test_summary_is_none_until_generated(client: TestClient, sample_wav: Path) -> None:
    job_id = _done_job(client, sample_wav)
    assert client.get(f"/api/v1/jobs/{job_id}/summary").json()["status"] == "none"


def test_generate_summary(client: TestClient, sample_wav: Path, fake_llm: FakeLLM) -> None:
    job_id = _done_job(client, sample_wav)

    res = client.post(f"/api/v1/jobs/{job_id}/summary")
    assert res.status_code == 202
    assert res.json()["status"] in {"queued", "processing", "done"}

    s = wait_for_summary(client, job_id, {"done", "failed"})
    assert s["status"] == "done", s["error"]
    assert s["content"] == "## Ringkasan\nRapat membahas budget."
    assert s["model"] == "fake-llm"
    assert s["edited"] is False
    # the transcript (with timestamps) was what the model saw
    assert "[00:01] Let's review the budget." in fake_llm.calls[0][1].content


def test_edit_then_regenerate_resets_edited(client: TestClient, sample_wav: Path) -> None:
    job_id = _done_job(client, sample_wav)
    client.post(f"/api/v1/jobs/{job_id}/summary")
    wait_for_summary(client, job_id, {"done"})

    res = client.put(f"/api/v1/jobs/{job_id}/summary", json={"content": "  Edited by hand \n"})
    assert res.status_code == 200
    assert res.json()["content"] == "Edited by hand"
    assert res.json()["edited"] is True

    client.post(f"/api/v1/jobs/{job_id}/summary")
    s = wait_for_summary(client, job_id, {"done"})
    assert s["edited"] is False
    assert s["content"].startswith("## Ringkasan")


def test_llm_failure_is_reported_and_retryable(
    client: TestClient, sample_wav: Path, fake_llm: FakeLLM
) -> None:
    job_id = _done_job(client, sample_wav)
    fake_llm.fail_with = LLMError(
        "Ollama is not running at http://x. Start it with `ollama serve`."
    )
    client.post(f"/api/v1/jobs/{job_id}/summary")
    s = wait_for_summary(client, job_id, {"done", "failed"})
    assert s["status"] == "failed"
    assert "ollama serve" in s["error"]

    fake_llm.fail_with = None
    assert client.post(f"/api/v1/jobs/{job_id}/summary").status_code == 202
    assert wait_for_summary(client, job_id, {"done"})["error"] is None


def test_unexpected_llm_error_is_labelled(
    client: TestClient, sample_wav: Path, fake_llm: FakeLLM
) -> None:
    job_id = _done_job(client, sample_wav)
    fake_llm.fail_with = ValueError("boom")
    client.post(f"/api/v1/jobs/{job_id}/summary")
    assert wait_for_summary(client, job_id, {"failed"})["error"] == "Unexpected error: boom"


def test_summary_conflicts(client: TestClient, sample_wav: Path, fake_transcriber) -> None:
    # transcript not ready
    fake_transcriber.fail_with = RuntimeError("nope")
    failed = upload(client, sample_wav).json()["id"]
    wait_for_status(client, failed, {"failed"})
    assert client.post(f"/api/v1/jobs/{failed}/summary").status_code == 409
    # nothing to edit yet
    fake_transcriber.fail_with = None
    ok = _done_job(client, sample_wav)
    assert client.put(f"/api/v1/jobs/{ok}/summary", json={"content": "x"}).status_code == 409
    # unknown job
    assert client.post("/api/v1/jobs/nope/summary").status_code == 404
    assert client.get("/api/v1/jobs/nope/summary").status_code == 404


def test_deleting_job_deletes_summary(client: TestClient, sample_wav: Path) -> None:
    job_id = _done_job(client, sample_wav)
    client.post(f"/api/v1/jobs/{job_id}/summary")
    wait_for_summary(client, job_id, {"done"})
    assert client.delete(f"/api/v1/jobs/{job_id}").status_code == 204
    assert client.get(f"/api/v1/jobs/{job_id}/summary").status_code == 404


def test_ai_status_reports_unreachable_ollama(client: TestClient) -> None:
    st = client.get("/api/v1/ai/status").json()
    assert st["reachable"] is False
    assert st["model"] == "qwen3.5:4b"
    assert st["error"]


def test_cannot_delete_job_while_summary_is_being_written(
    client: TestClient, sample_wav: Path
) -> None:
    from app.models.job import Summary, SummaryStatus

    job_id = _done_job(client, sample_wav)
    # put the summary in "processing" directly: the fake LLM finishes too fast to catch it
    with client.app.state.session_factory() as session:
        session.add(Summary(job_id=job_id, status=SummaryStatus.PROCESSING))
        session.commit()

    res = client.delete(f"/api/v1/jobs/{job_id}")

    assert res.status_code == 409
    assert "summary" in res.json()["detail"].lower()
    assert client.get(f"/api/v1/jobs/{job_id}").status_code == 200
