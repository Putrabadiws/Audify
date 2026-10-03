import subprocess
from pathlib import Path

PLAYBACK_FILENAME = "playback.m4a"


class MediaError(Exception):
    pass


def probe_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True,
        check=False,  # non-zero exit is turned into MediaError below
        text=True,
    )
    if result.returncode != 0 or not result.stdout.strip():
        raise MediaError(f"ffprobe failed for {path.name}: {result.stderr.strip()[-500:]}")
    try:
        return float(result.stdout.strip())
    except ValueError as exc:
        raise MediaError(f"ffprobe returned no duration for {path.name}") from exc


def make_playback_audio(source: Path, dest: Path) -> None:
    """Transcode any upload (mov, ogg, webm, ...) to AAC m4a.

    Why: browsers disagree on containers (Safari can't play ogg/webm, nobody plays .mov audio
    reliably), and the editor only needs audio. AAC/m4a plays everywhere and is small.
    """
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(source),
            "-vn",
            "-ac",
            "1",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-movflags",
            "+faststart",
            str(dest),
        ],
        capture_output=True,
        check=False,  # non-zero exit is turned into MediaError below
        text=True,
    )
    if result.returncode != 0:
        raise MediaError(f"ffmpeg failed for {source.name}: {result.stderr.strip()[-500:]}")


# Container → MIME for streaming the original upload to <video>. The browser decides what it
# can actually decode; the frontend falls back to the playback audio when it can't.
VIDEO_MEDIA_TYPES = {
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
}


def has_video_stream(path: Path) -> bool:
    """True if the file carries real picture frames.

    Decided by the streams, not the extension: browser recordings are audio-only .webm, and an
    mp3's album art shows up as a video stream flagged `attached_pic` (a still, not a video).
    Unreadable files count as "no video" — the audio pipeline reports the real error.
    """
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v",
            "-show_entries",
            "stream_disposition=attached_pic",
            "-of",
            "csv=p=0",
            str(path),
        ],
        capture_output=True,
        check=False,
        text=True,
    )
    if result.returncode != 0:
        return False
    # one line per video stream: "0" = real video, "1" = cover art
    return any(line.strip() == "0" for line in result.stdout.splitlines())
