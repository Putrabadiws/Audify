from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.repositories.job_repository import like_pattern
from app.services.job_service import InvalidTagError, normalize_tags
from app.services.transcriber import SegmentData, TranscriptionResult
from tests.conftest import FakeTranscriber, requires_ffmpeg, upload, wait_for_status


def _done_job(client: TestClient, wav: Path, title: str) -> str:
    job_id = upload(client, wav).json()["id"]
    wait_for_status(client, job_id, {"done"})
    client.patch(f"/api/v1/jobs/{job_id}", json={"title": title})
    return job_id


# ---- pure helpers -------------------------------------------------------------------------


def test_normalize_tags_trims_dedupes_case_insensitively() -> None:
    assert normalize_tags(["  Meeting ", "meeting", "Q4   budget", "", "   "]) == [
        "Meeting",
        "Q4 budget",
    ]


def test_normalize_tags_rejects_overlong() -> None:
    with pytest.raises(InvalidTagError):
        normalize_tags(["x" * 51])


def test_like_pattern_escapes_wildcards() -> None:
    assert like_pattern("100%") == "%100\\%%"
    assert like_pattern("a_b") == "%a\\_b%"
    assert like_pattern("c:\\x") == "%c:\\\\x%"


# ---- tags API -----------------------------------------------------------------------------


@requires_ffmpeg
def test_set_tags_reuses_existing_case_insensitively(client: TestClient, sample_wav: Path) -> None:
    a = _done_job(client, sample_wav, "A")
    b = _done_job(client, sample_wav, "B")

    res = client.put(f"/api/v1/jobs/{a}/tags", json={"tags": ["Meeting", "Q4"]})
    assert res.status_code == 200
    assert [t["name"] for t in res.json()["tags"]] == ["Meeting", "Q4"]
    client.put(f"/api/v1/jobs/{b}/tags", json={"tags": ["meeting"]})

    tags = client.get("/api/v1/tags").json()
    assert [(t["name"], t["job_count"]) for t in tags] == [("Meeting", 2), ("Q4", 1)]
    # tags also appear on list and detail responses
    assert [t["name"] for t in client.get(f"/api/v1/jobs/{b}").json()["tags"]] == ["Meeting"]


@requires_ffmpeg
def test_removing_last_use_prunes_tag(client: TestClient, sample_wav: Path) -> None:
    a = _done_job(client, sample_wav, "A")
    client.put(f"/api/v1/jobs/{a}/tags", json={"tags": ["temp"]})
    client.put(f"/api/v1/jobs/{a}/tags", json={"tags": []})
    assert client.get("/api/v1/tags").json() == []


@requires_ffmpeg
def test_deleting_job_prunes_nothing_else_and_keeps_shared_tags(
    client: TestClient, sample_wav: Path
) -> None:
    a = _done_job(client, sample_wav, "A")
    b = _done_job(client, sample_wav, "B")
    client.put(f"/api/v1/jobs/{a}/tags", json={"tags": ["shared"]})
    client.put(f"/api/v1/jobs/{b}/tags", json={"tags": ["shared"]})
    client.delete(f"/api/v1/jobs/{a}")
    assert [(t["name"], t["job_count"]) for t in client.get("/api/v1/tags").json()] == [
        ("shared", 1)
    ]


@requires_ffmpeg
def test_tag_validation_and_404(client: TestClient, sample_wav: Path) -> None:
    a = _done_job(client, sample_wav, "A")
    assert client.put(f"/api/v1/jobs/{a}/tags", json={"tags": ["x" * 51]}).status_code == 422
    too_many = [f"t{i}" for i in range(21)]
    assert client.put(f"/api/v1/jobs/{a}/tags", json={"tags": too_many}).status_code == 422
    assert client.put("/api/v1/jobs/nope/tags", json={"tags": ["a"]}).status_code == 404


@requires_ffmpeg
def test_filter_jobs_by_tag(client: TestClient, sample_wav: Path) -> None:
    a = _done_job(client, sample_wav, "A")
    _done_job(client, sample_wav, "B")
    tag_id = client.put(f"/api/v1/jobs/{a}/tags", json={"tags": ["client"]}).json()["tags"][0]["id"]

    assert [j["title"] for j in client.get("/api/v1/jobs", params={"tag": tag_id}).json()] == ["A"]
    assert client.get("/api/v1/jobs", params={"tag": 9999}).json() == []


# ---- search API ---------------------------------------------------------------------------


class ScriptedTranscriber(FakeTranscriber):
    """Returns a different transcript per call, in order."""

    def __init__(self, scripts: list[list[str]]):
        super().__init__()
        self.scripts = scripts

    def transcribe(self, audio_path, language, prompt, on_progress):
        texts = self.scripts[len(self.calls)]
        self.calls.append({"audio_path": audio_path})
        return TranscriptionResult(
            language="id",
            duration=float(len(texts)),
            segments=[SegmentData(float(i), float(i + 1), t) for i, t in enumerate(texts)],
        )


@pytest.fixture
def fake_transcriber() -> ScriptedTranscriber:
    return ScriptedTranscriber(
        [
            ["Budget naik 100% bulan ini.", "Campaign Chitato sukses.", "Chitato lagi."],
            ["Budget naik 1000 unit.", "Rapat selesai."],
            ["Kode a_b dipakai.", "Kode axb salah."],
        ]
    )


@requires_ffmpeg
def test_search_matches_transcript_and_returns_snippets(
    client: TestClient, sample_wav: Path
) -> None:
    first = _done_job(client, sample_wav, "Rapat Q4")
    _done_job(client, sample_wav, "Rapat Q3")

    res = client.get("/api/v1/jobs", params={"q": "CHITATO"}).json()
    assert [j["id"] for j in res] == [first]
    assert [(m["start"], m["text"]) for m in res[0]["matches"]] == [
        (1.0, "Campaign Chitato sukses."),
        (2.0, "Chitato lagi."),
    ]


@requires_ffmpeg
def test_search_matches_title_without_snippets(client: TestClient, sample_wav: Path) -> None:
    _done_job(client, sample_wav, "Rapat Q4")
    second = _done_job(client, sample_wav, "Weekly sync")

    res = client.get("/api/v1/jobs", params={"q": "weekly"}).json()
    assert [j["id"] for j in res] == [second]
    assert res[0]["matches"] == []


@requires_ffmpeg
def test_search_wildcards_are_literal(client: TestClient, sample_wav: Path) -> None:
    j100 = _done_job(client, sample_wav, "one")
    _done_job(client, sample_wav, "two")
    jab = _done_job(client, sample_wav, "three")

    # "100%" must not match "1000"; "a_b" must not match "axb"
    assert [j["id"] for j in client.get("/api/v1/jobs", params={"q": "100%"}).json()] == [j100]
    hits = client.get("/api/v1/jobs", params={"q": "a_b"}).json()
    assert [j["id"] for j in hits] == [jab]
    assert [m["text"] for m in hits[0]["matches"]] == ["Kode a_b dipakai."]


@requires_ffmpeg
def test_blank_search_returns_everything(client: TestClient, sample_wav: Path) -> None:
    _done_job(client, sample_wav, "one")
    _done_job(client, sample_wav, "two")
    res = client.get("/api/v1/jobs", params={"q": "   "}).json()
    assert len(res) == 2
    assert all(j["matches"] == [] for j in res)
