import logging
import shutil
from functools import lru_cache
from pathlib import Path
from typing import BinaryIO

from app.models.job import Job, JobStatus, Segment, Summary, SummaryStatus, Tag
from app.repositories.job_repository import JobRepository
from app.repositories.tag_repository import TagRepository
from app.schemas.job import ExportFormat, SearchMatch, TranscribeRequest
from app.services import media
from app.services.exporters import ExportSegment, render_export
from app.services.worker import TranscriptionWorker, job_media_dir, original_media_path

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {
    ".mp3",
    ".m4a",
    ".wav",
    ".ogg",
    ".oga",
    ".opus",
    ".flac",
    ".aac",
    ".webm",
    ".mp4",
    ".mov",
    ".mkv",
    ".m4v",
}
AUTO_LANGUAGE = "auto"
MAX_TAG_LENGTH = 50
# Snippets per job in search results — enough to show context without dumping the transcript.
SEARCH_MATCHES_PER_JOB = 3


@lru_cache(maxsize=512)
def _probe_has_video(path: str, mtime_ns: int) -> bool:
    # The job detail is polled while transcribing; cache the ffprobe subprocess per file.
    # mtime is part of the key so a replaced file is re-probed (originals are normally immutable).
    return media.has_video_stream(Path(path))


class UnsupportedMediaError(Exception):
    pass


class JobNotReadyError(Exception):
    pass


class InvalidTagError(Exception):
    pass


def normalize_tags(names: list[str]) -> list[str]:
    """Trim, collapse inner whitespace, drop empties, dedupe case-insensitively (first wins)."""
    seen: set[str] = set()
    result: list[str] = []
    for raw in names:
        name = " ".join(raw.split())
        if not name:
            continue
        if len(name) > MAX_TAG_LENGTH:
            raise InvalidTagError(f"Tag too long (max {MAX_TAG_LENGTH} characters): {name[:20]}…")
        if name.lower() not in seen:
            seen.add(name.lower())
            result.append(name)
    return result


def normalize_language(language: str | None, default: str) -> str | None:
    """Empty → server default; "auto" → None (Whisper auto-detect)."""
    if not language:
        return default
    return None if language == AUTO_LANGUAGE else language


class JobService:
    def __init__(
        self,
        repository: JobRepository,
        tag_repository: TagRepository,
        worker: TranscriptionWorker,
        media_root: Path,
    ):
        self.repository = repository
        self.tag_repository = tag_repository
        self.worker = worker
        self.media_root = media_root

    def create_from_upload(
        self,
        filename: str,
        stream: BinaryIO,
        language: str | None,
        vocabulary: str,
        default_language: str,
    ) -> Job:
        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise UnsupportedMediaError(f"Unsupported file type: {ext or 'none'}")

        job = Job(
            title=Path(filename).stem[:255] or "Untitled",
            original_filename=filename[:255],
            media_ext=ext,
            language=normalize_language(language, default_language),
            vocabulary=vocabulary.strip(),
            status=JobStatus.QUEUED,
        )
        job = self.repository.add(job)

        dest = original_media_path(self.media_root, job.id, ext)
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            with dest.open("wb") as out:
                shutil.copyfileobj(stream, out, length=1024 * 1024)
        except Exception:
            # don't leave a queued job pointing at a half-written file
            self.repository.delete(job)
            shutil.rmtree(dest.parent, ignore_errors=True)
            raise
        logger.info("job created job_id=%s ext=%s", job.id, ext)
        self.worker.enqueue(job.id)
        return job

    def list_jobs(self, tag_id: int | None = None, query: str | None = None) -> list[Job]:
        return self.repository.find_all(tag_id=tag_id, text=(query or "").strip() or None)

    def search_matches(self, jobs: list[Job], query: str) -> dict[str, list[SearchMatch]]:
        text = query.strip()
        hits = self.repository.find_matching_segments(
            [j.id for j in jobs], text, SEARCH_MATCHES_PER_JOB
        )
        return {
            job_id: [SearchMatch(segment_id=s.id, start=s.start, text=s.text) for s in segs]
            for job_id, segs in hits.items()
        }

    def list_tags(self) -> list[tuple[Tag, int]]:
        return self.tag_repository.find_all_with_counts()

    def set_tags(self, job: Job, names: list[str]) -> Job:
        """Replace the job's tags; reuses existing tags case-insensitively, prunes unused ones."""
        wanted = normalize_tags(names)
        existing = self.tag_repository.find_by_names_ci(wanted)
        job.tags = [existing.get(n.lower()) or Tag(name=n) for n in wanted]
        self.repository.session.flush()
        self.tag_repository.delete_orphans()
        self.repository.commit()
        return job

    def get_job(self, job_id: str, with_segments: bool = False) -> Job | None:
        return self.repository.find_by_id(job_id, with_segments=with_segments)

    def rename(self, job: Job, title: str) -> Job:
        job.title = title.strip()
        self.repository.commit()
        return job

    def update_segment_text(self, job_id: str, segment_id: int, text: str) -> Segment | None:
        segment = self.repository.find_segment(job_id, segment_id)
        if segment is None:
            return None
        segment.text = text.strip()
        # edited text no longer matches the word timings; drop them rather than lie
        segment.words = []
        self.repository.commit()
        return segment

    def retranscribe(self, job: Job, request: TranscribeRequest, default_language: str) -> Job:
        if job.status in (JobStatus.QUEUED, JobStatus.PROCESSING):
            raise JobNotReadyError("Job is already queued or processing")
        if request.language is not None:
            job.language = normalize_language(request.language, default_language)
        if request.vocabulary is not None:
            job.vocabulary = request.vocabulary.strip()
        job.status = JobStatus.QUEUED
        job.progress = 0.0
        job.error = None
        self.repository.commit()
        self.worker.enqueue(job.id)
        return job

    def delete(self, job: Job) -> None:
        if job.status == JobStatus.PROCESSING:
            raise JobNotReadyError("Cannot delete a job while it is processing")
        # Same rule for the summary: the worker would keep writing to a deleted row and log a
        # misleading "summary failed". A merely *queued* summary is fine — the worker skips it.
        if job.summary is not None and job.summary.status == SummaryStatus.PROCESSING:
            raise JobNotReadyError("Cannot delete a job while its AI summary is being written")
        job_id = job.id
        self.repository.delete(job)
        shutil.rmtree(job_media_dir(self.media_root, job_id), ignore_errors=True)
        logger.info("job deleted job_id=%s", job_id)

    def playback_path(self, job: Job) -> Path | None:
        path = job_media_dir(self.media_root, job.id) / media.PLAYBACK_FILENAME
        return path if path.exists() else None

    def video_path(self, job: Job) -> Path | None:
        """The original upload, if it has real video frames (see media.has_video_stream)."""
        path = original_media_path(self.media_root, job.id, job.media_ext)
        try:
            mtime_ns = path.stat().st_mtime_ns
        except FileNotFoundError:
            return None
        return path if _probe_has_video(str(path), mtime_ns) else None

    def request_summary(self, job: Job) -> Summary:
        """Queue (re)generation of the AI summary; replaces any previous content when done."""
        if job.status != JobStatus.DONE:
            raise JobNotReadyError("Transcript is not ready yet")
        if not job.segments:
            raise JobNotReadyError("This transcript is empty — nothing to summarize")
        summary = job.summary
        if summary is not None and summary.status in (
            SummaryStatus.QUEUED,
            SummaryStatus.PROCESSING,
        ):
            raise JobNotReadyError("A summary is already being generated")
        if summary is None:
            summary = Summary(job_id=job.id)
            job.summary = summary
        summary.status = SummaryStatus.QUEUED
        summary.progress = 0.0
        summary.error = None
        self.repository.commit()
        self.worker.enqueue_summary(job.id)
        logger.info("summary queued job_id=%s", job.id)
        return summary

    def update_summary(self, job: Job, content: str) -> Summary:
        summary = job.summary
        if summary is None or summary.status != SummaryStatus.DONE:
            raise JobNotReadyError("There is no finished summary to edit")
        summary.content = content.strip()
        summary.edited = True
        self.repository.commit()
        return summary

    def export(self, job: Job, fmt: ExportFormat, timestamps: bool) -> str:
        if job.status != JobStatus.DONE:
            raise JobNotReadyError("Transcript is not ready yet")
        segments = [ExportSegment(start=s.start, end=s.end, text=s.text) for s in job.segments]
        return render_export(fmt, job.title, segments, timestamps)
