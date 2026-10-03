import subprocess
from pathlib import Path

from fastapi.testclient import TestClient

from tests.conftest import FakeTranscriber, requires_ffmpeg, upload, wait_for_status

pytestmark = requires_ffmpeg


def test_upload_transcribes_and_returns_segments(
    client: TestClient, sample_wav: Path, fake_transcriber: FakeTranscriber
) -> None:
    res = upload(client, sample_wav, language="id", vocabulary="Chitato")
    assert res.status_code == 201
    job_id = res.json()["id"]
    assert res.json()["title"] == "sample"

    job = wait_for_status(client, job_id, {"done", "failed"})
    assert job["status"] == "done", job["error"]
    assert job["progress"] == 1.0
    assert job["model"] == "fake-model"
    assert job["duration"] > 1.5
    assert [s["text"] for s in job["segments"]] == [
        "Selamat pagi semua.",
        "Let's review the budget.",
    ]
    assert fake_transcriber.calls[0]["language"] == "id"
    assert fake_transcriber.calls[0]["prompt"] == "Chitato"


def test_global_vocabulary_is_prepended(
    client: TestClient, sample_wav: Path, fake_transcriber: FakeTranscriber
) -> None:
    assert client.put("/api/v1/settings", json={"vocabulary": "TikTok"}).status_code == 200
    job_id = upload(client, sample_wav, vocabulary="hak cipta").json()["id"]
    wait_for_status(client, job_id, {"done"})
    assert fake_transcriber.calls[0]["prompt"] == "TikTok, hak cipta"


def test_auto_language_passes_none(
    client: TestClient, sample_wav: Path, fake_transcriber: FakeTranscriber
) -> None:
    job_id = upload(client, sample_wav, language="auto").json()["id"]
    wait_for_status(client, job_id, {"done"})
    assert fake_transcriber.calls[0]["language"] is None


def test_unsupported_extension_rejected(client: TestClient, tmp_path: Path) -> None:
    bad = tmp_path / "notes.txt"
    bad.write_text("hello")
    res = upload(client, bad)
    assert res.status_code == 415
    assert client.get("/api/v1/jobs").json() == []


def test_unknown_job_is_404(client: TestClient) -> None:
    assert client.get("/api/v1/jobs/nope").status_code == 404
    assert client.get("/api/v1/jobs/nope/export").status_code == 404
    assert client.delete("/api/v1/jobs/nope").status_code == 404


def test_edit_segment_and_rename(client: TestClient, sample_wav: Path) -> None:
    job_id = upload(client, sample_wav).json()["id"]
    job = wait_for_status(client, job_id, {"done"})
    seg_id = job["segments"][0]["id"]

    res = client.patch(f"/api/v1/jobs/{job_id}/segments/{seg_id}", json={"text": "  Pagi semua.  "})
    assert res.status_code == 200
    assert res.json()["text"] == "Pagi semua."
    assert (
        client.patch(f"/api/v1/jobs/{job_id}/segments/999999", json={"text": "x"}).status_code
        == 404
    )

    assert (
        client.patch(f"/api/v1/jobs/{job_id}", json={"title": "Rapat Q4"}).json()["title"]
        == "Rapat Q4"
    )
    assert client.patch(f"/api/v1/jobs/{job_id}", json={"title": ""}).status_code == 422

    job = client.get(f"/api/v1/jobs/{job_id}").json()
    assert job["segments"][0]["text"] == "Pagi semua."


def test_export_formats(client: TestClient, sample_wav: Path) -> None:
    job_id = upload(client, sample_wav).json()["id"]
    wait_for_status(client, job_id, {"done"})

    srt = client.get(f"/api/v1/jobs/{job_id}/export", params={"format": "srt"})
    assert srt.status_code == 200
    assert srt.headers["content-disposition"].startswith('attachment; filename="sample.srt"; ')
    assert "00:00:01,000 --> 00:00:02,000" in srt.text

    txt = client.get(
        f"/api/v1/jobs/{job_id}/export", params={"format": "txt", "timestamps": "false"}
    )
    assert txt.text == "Selamat pagi semua. Let's review the budget.\n"

    assert client.get(f"/api/v1/jobs/{job_id}/export", params={"format": "docx"}).status_code == 422


def test_media_supports_range_requests(client: TestClient, sample_wav: Path) -> None:
    job_id = upload(client, sample_wav).json()["id"]
    wait_for_status(client, job_id, {"done"})

    full = client.get(f"/api/v1/jobs/{job_id}/media")
    assert full.status_code == 200
    assert full.headers["content-type"] == "audio/mp4"

    # the <audio> element needs 206 partial content to seek
    part = client.get(f"/api/v1/jobs/{job_id}/media", headers={"Range": "bytes=0-99"})
    assert part.status_code == 206
    assert len(part.content) == 100


def test_failed_transcription_is_reported_and_retryable(
    client: TestClient, sample_wav: Path, fake_transcriber: FakeTranscriber
) -> None:
    fake_transcriber.fail_with = RuntimeError("model exploded")
    job_id = upload(client, sample_wav).json()["id"]
    job = wait_for_status(client, job_id, {"done", "failed"})
    assert job["status"] == "failed"
    assert job["error"] == "model exploded"
    assert client.get(f"/api/v1/jobs/{job_id}/export").status_code == 409

    fake_transcriber.fail_with = None
    res = client.post(f"/api/v1/jobs/{job_id}/transcribe", json={"language": "en"})
    assert res.status_code == 200
    job = wait_for_status(client, job_id, {"done"})
    assert job["language"] == "en"
    assert job["error"] is None


def test_corrupt_media_fails_cleanly(client: TestClient, tmp_path: Path) -> None:
    bad = tmp_path / "broken.mp3"
    bad.write_bytes(b"not really audio")
    job_id = upload(client, bad).json()["id"]
    job = wait_for_status(client, job_id, {"done", "failed"})
    assert job["status"] == "failed"
    assert "ffmpeg failed" in job["error"]


def test_delete_removes_job_and_media(client: TestClient, sample_wav: Path, tmp_path: Path) -> None:
    job_id = upload(client, sample_wav).json()["id"]
    wait_for_status(client, job_id, {"done"})
    media_dir = tmp_path / "data" / "media" / job_id
    assert media_dir.exists()

    assert client.delete(f"/api/v1/jobs/{job_id}").status_code == 204
    assert client.get(f"/api/v1/jobs/{job_id}").status_code == 404
    assert not media_dir.exists()


def test_request_id_header_echoed(client: TestClient) -> None:
    res = client.get("/health", headers={"X-Request-ID": "abc123"})
    assert res.headers["x-request-id"] == "abc123"


def test_timestamps_are_timezone_aware(client: TestClient, sample_wav: Path) -> None:
    # SQLite drops tzinfo; a naive "2026-09-27T16:47:18" is read as *local* time by browsers,
    # shifting every date by the viewer's UTC offset (7h in WIB).
    job = upload(client, sample_wav).json()
    assert job["created_at"].endswith(("Z", "+00:00"))
    listed = client.get("/api/v1/jobs").json()[0]
    assert listed["updated_at"].endswith(("Z", "+00:00"))


def test_browser_recording_webm_without_duration_header(client: TestClient, tmp_path: Path) -> None:
    # MediaRecorder streams webm, so the container has no duration/cues — same as ffmpeg
    # writing to a non-seekable pipe. Duration must come from the transcoded playback file.
    webm = tmp_path / "Recording 2026-09-28 09.05.07.webm"
    with webm.open("wb") as out:
        subprocess.run(
            [
                "ffmpeg",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=2",
                "-c:a",
                "libopus",
                "-f",
                "webm",
                "pipe:1",
            ],
            stdout=out,
            check=True,
        )
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(webm)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert probe.stdout.strip() in ("", "N/A")  # precondition: really no duration header

    res = upload(client, webm, language="id")
    assert res.status_code == 201
    assert res.json()["title"] == "Recording 2026-09-28 09.05.07"
    job = wait_for_status(client, res.json()["id"], {"done", "failed"})
    assert job["status"] == "done", job["error"]
    assert 1.5 < job["duration"] < 2.5


def test_export_with_non_latin1_title(client: TestClient, sample_wav: Path) -> None:
    # Starlette encodes headers as latin-1: a title with an en dash, curly quotes or CJK used
    # to crash the export with a 500. Quotes/CR/LF must not break out of the header either.
    job_id = upload(client, sample_wav).json()["id"]
    wait_for_status(client, job_id, {"done"})
    client.patch(
        f"/api/v1/jobs/{job_id}", json={"title": 'Rapat – Q4 “final” 会議 "x"\r\nX-Evil: 1'}
    )

    res = client.get(f"/api/v1/jobs/{job_id}/export", params={"format": "txt"})

    assert res.status_code == 200
    cd = res.headers["content-disposition"]
    assert "x-evil" not in {k.lower() for k in res.headers}
    ascii_part = cd.split('filename="', 1)[1].split('"', 1)[0]
    assert ascii_part.isascii() and "\r" not in ascii_part and '"' not in ascii_part
    assert ascii_part.endswith(".txt")
    # the real name survives in the RFC 5987 parameter
    assert "filename*=UTF-8''Rapat%20%E2%80%93%20Q4" in cd


def _ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


SINE = ["-f", "lavfi", "-i", "sine=frequency=440:duration=2"]


def test_video_upload_exposes_video_stream(client: TestClient, tmp_path: Path) -> None:
    mp4 = tmp_path / "rapat.mp4"
    _ffmpeg(
        "-f", "lavfi", "-i", "testsrc=size=160x90:rate=10:duration=2", *SINE,
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(mp4),
    )  # fmt: skip
    job_id = upload(client, mp4).json()["id"]
    job = wait_for_status(client, job_id, {"done"})
    assert job["has_video"] is True

    full = client.get(f"/api/v1/jobs/{job_id}/video")
    assert full.status_code == 200
    assert full.headers["content-type"] == "video/mp4"
    assert full.content == mp4.read_bytes()  # the original, not a re-encode

    # <video> seeks with Range requests, same as the audio player
    part = client.get(f"/api/v1/jobs/{job_id}/video", headers={"Range": "bytes=0-99"})
    assert part.status_code == 206
    assert len(part.content) == 100


def test_audio_upload_has_no_video(client: TestClient, sample_wav: Path) -> None:
    job_id = upload(client, sample_wav).json()["id"]
    assert wait_for_status(client, job_id, {"done"})["has_video"] is False
    assert client.get(f"/api/v1/jobs/{job_id}/video").status_code == 404


def test_audio_only_mp4_is_not_video(client: TestClient, tmp_path: Path) -> None:
    # The extension lies: a .mp4/.webm can carry audio only (browser recordings are .webm).
    mp4 = tmp_path / "voice.mp4"
    _ffmpeg(*SINE, "-c:a", "aac", str(mp4))
    job_id = upload(client, mp4).json()["id"]
    assert wait_for_status(client, job_id, {"done"})["has_video"] is False
    assert client.get(f"/api/v1/jobs/{job_id}/video").status_code == 404


def test_mp3_cover_art_is_not_video(client: TestClient, tmp_path: Path) -> None:
    # Album art is a video stream flagged attached_pic — showing it as a "video" would be wrong.
    mp3 = tmp_path / "song.mp3"
    _ffmpeg(
        *SINE, "-f", "lavfi", "-i", "color=c=red:size=64x64:duration=1",
        "-map", "0", "-map", "1", "-c:a", "libmp3lame", "-c:v", "mjpeg",
        "-disposition:v", "attached_pic", str(mp3),
    )  # fmt: skip
    job_id = upload(client, mp3).json()["id"]
    assert wait_for_status(client, job_id, {"done"})["has_video"] is False


def test_video_of_unknown_job_is_404(client: TestClient) -> None:
    assert client.get("/api/v1/jobs/nope/video").status_code == 404
