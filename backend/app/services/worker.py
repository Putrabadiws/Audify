import enum
import logging
import queue
import threading
from dataclasses import asdict
from pathlib import Path

from sqlalchemy.orm import Session, sessionmaker

from app.models.job import JobStatus, Segment, Summary, SummaryStatus
from app.repositories.job_repository import JobRepository
from app.repositories.settings_repository import SettingsRepository
from app.services import media
from app.services.llm import LLMError
from app.services.summarizer import Summarizer, TranscriptLine
from app.services.transcriber import Transcriber, build_prompt

logger = logging.getLogger(__name__)

VOCABULARY_KEY = "vocabulary"
# Only persist progress when it moved ≥1%: every segment would hammer SQLite on long files.
PROGRESS_STEP = 0.01


class TaskKind(str, enum.Enum):
    TRANSCRIBE = "transcribe"
    SUMMARIZE = "summarize"


Task = tuple[TaskKind, str]


def job_media_dir(media_root: Path, job_id: str) -> Path:
    return media_root / job_id


def original_media_path(media_root: Path, job_id: str, ext: str) -> Path:
    return job_media_dir(media_root, job_id) / f"original{ext}"


class TranscriptionWorker:
    """Single background thread draining a FIFO of (task kind, job id).

    One worker for transcription AND summaries on purpose: on the 8 GB dev machine Whisper
    turbo (~1.9 GB) and a 4B LLM (~3.5 GB) running at once would swap. Serializing them costs
    latency, not correctness. Swap for a real queue (arq/Celery) on a GPU server.
    """

    def __init__(
        self,
        session_factory: sessionmaker[Session],
        transcriber: Transcriber,
        media_root: Path,
        summarizer: Summarizer | None = None,
    ):
        self._session_factory = session_factory
        self._transcriber = transcriber
        self._summarizer = summarizer
        self._media_root = media_root
        self._queue: queue.Queue[Task | None] = queue.Queue()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._recover_unfinished()
        self._thread = threading.Thread(target=self._run, name="transcription-worker", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._queue.put(None)
        if self._thread:
            self._thread.join(timeout=5)

    def enqueue(self, job_id: str) -> None:
        self._queue.put((TaskKind.TRANSCRIBE, job_id))

    def enqueue_summary(self, job_id: str) -> None:
        self._queue.put((TaskKind.SUMMARIZE, job_id))

    def _recover_unfinished(self) -> None:
        # A restart mid-job leaves it "processing" forever; requeue so it runs again.
        with self._session_factory() as session:
            repo = JobRepository(session)
            for job in repo.find_by_status(JobStatus.QUEUED, JobStatus.PROCESSING):
                job.status = JobStatus.QUEUED
                job.progress = 0.0
                repo.commit()
                self.enqueue(job.id)
                logger.info("requeued unfinished job job_id=%s", job.id)
            pending = session.query(Summary).filter(
                Summary.status.in_([SummaryStatus.QUEUED, SummaryStatus.PROCESSING])
            )
            for summary in pending.all():
                summary.status = SummaryStatus.QUEUED
                summary.progress = 0.0
                session.commit()
                self.enqueue_summary(summary.job_id)
                logger.info("requeued unfinished summary job_id=%s", summary.job_id)

    def _run(self) -> None:
        while True:
            task = self._queue.get()
            if task is None:
                return
            kind, job_id = task
            try:
                if kind is TaskKind.SUMMARIZE:
                    self.process_summary(job_id)
                else:
                    self.process(job_id)
            except Exception:
                # process*() already mark the row failed; this guards the thread itself
                logger.exception("worker crashed kind=%s job_id=%s", kind.value, job_id)

    def process(self, job_id: str) -> None:
        """Prepare playback audio, transcribe, persist segments. Public for synchronous tests."""
        with self._session_factory() as session:
            repo = JobRepository(session)
            job = repo.find_by_id(job_id, with_segments=True)
            if job is None:
                logger.warning("job vanished before processing job_id=%s", job_id)
                return
            job.status = JobStatus.PROCESSING
            job.progress = 0.0
            job.error = None
            repo.commit()
            logger.info("transcription started job_id=%s", job_id)

            try:
                source = original_media_path(self._media_root, job.id, job.media_ext)
                playback = job_media_dir(self._media_root, job.id) / media.PLAYBACK_FILENAME
                if not playback.exists():
                    media.make_playback_audio(source, playback)
                job.duration = media.probe_duration(playback)
                repo.commit()

                prompt = build_prompt(
                    SettingsRepository(session).get(VOCABULARY_KEY), job.vocabulary
                )
                last_saved = 0.0

                def on_progress(fraction: float) -> None:
                    nonlocal last_saved
                    if fraction - last_saved >= PROGRESS_STEP:
                        job.progress = fraction
                        repo.commit()
                        last_saved = fraction

                result = self._transcriber.transcribe(source, job.language, prompt, on_progress)

                repo.replace_segments(
                    job,
                    [
                        Segment(
                            idx=i,
                            start=s.start,
                            end=s.end,
                            text=s.text,
                            words=[asdict(w) for w in s.words],
                        )
                        for i, s in enumerate(result.segments)
                    ],
                )
                job.detected_language = result.language
                job.model = self._transcriber.model_name
                job.status = JobStatus.DONE
                job.progress = 1.0
                repo.commit()
                logger.info(
                    "transcription done job_id=%s segments=%d language=%s",
                    job_id,
                    len(result.segments),
                    result.language,
                )
            except Exception as exc:
                session.rollback()
                job = repo.find_by_id(job_id)
                if job is not None:
                    job.status = JobStatus.FAILED
                    job.error = str(exc)[:2000]
                    repo.commit()
                logger.exception("transcription failed job_id=%s", job_id)

    def process_summary(self, job_id: str) -> None:
        """Generate AI minutes for a finished transcript. Public for synchronous tests."""
        with self._session_factory() as session:
            repo = JobRepository(session)
            job = repo.find_by_id(job_id, with_segments=True)
            summary = job.summary if job else None
            if job is None or summary is None:
                logger.warning("summary target vanished job_id=%s", job_id)
                return
            summary.status = SummaryStatus.PROCESSING
            summary.progress = 0.0
            summary.error = None
            repo.commit()
            logger.info("summary started job_id=%s segments=%d", job_id, len(job.segments))

            try:
                if self._summarizer is None:
                    raise LLMError("AI summaries are not configured on this server.")

                def on_progress(fraction: float) -> None:
                    summary.progress = fraction
                    repo.commit()

                lines = [TranscriptLine(s.start, s.text) for s in job.segments]
                content = self._summarizer.summarize(job.title, lines, on_progress)
                summary.content = content
                summary.model = self._summarizer.client.model
                summary.edited = False
                summary.status = SummaryStatus.DONE
                summary.progress = 1.0
                repo.commit()
                logger.info("summary done job_id=%s chars=%d", job_id, len(content))
            except Exception as exc:
                session.rollback()
                summary = session.get(Summary, job_id)
                if summary is not None:
                    summary.status = SummaryStatus.FAILED
                    # LLMError messages are written for users; anything else is a bug
                    summary.error = (
                        str(exc) if isinstance(exc, LLMError) else f"Unexpected error: {exc}"
                    )[:2000]
                    repo.commit()
                logger.exception("summary failed job_id=%s", job_id)
