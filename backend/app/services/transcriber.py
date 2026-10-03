import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

logger = logging.getLogger(__name__)

# Whisper's initial_prompt is capped at ~224 tokens; beyond that the head is silently dropped.
# ~800 chars stays under the cap for ID/EN text and keeps the most recent (job-specific) terms.
MAX_PROMPT_CHARS = 800


@dataclass
class WordData:
    start: float
    end: float
    word: str
    probability: float


@dataclass
class SegmentData:
    start: float
    end: float
    text: str
    words: list[WordData] = field(default_factory=list)


@dataclass
class TranscriptionResult:
    language: str | None
    duration: float
    segments: list[SegmentData]


ProgressCallback = Callable[[float], None]


class Transcriber(Protocol):
    model_name: str

    def transcribe(
        self,
        audio_path: Path,
        language: str | None,
        prompt: str | None,
        on_progress: ProgressCallback,
    ) -> TranscriptionResult: ...


def build_prompt(global_vocabulary: str, job_vocabulary: str) -> str | None:
    """Merge vocabularies into Whisper's initial_prompt (spike: domain terms fix mis-hearings)."""
    parts = [v.strip() for v in (global_vocabulary, job_vocabulary) if v and v.strip()]
    if not parts:
        return None
    prompt = ", ".join(parts)
    # keep the tail: job vocabulary comes last and is the most specific
    return prompt[-MAX_PROMPT_CHARS:]


class FasterWhisperTranscriber:
    """faster-whisper wrapper. Model loads lazily on first job (~1.6 GB download first time)."""

    def __init__(self, model_name: str, device: str, compute_type: str):
        self.model_name = model_name
        self._device = device
        self._compute_type = compute_type
        self._model = None
        self._lock = threading.Lock()

    def _get_model(self):
        with self._lock:
            if self._model is None:
                from faster_whisper import WhisperModel

                logger.info("loading whisper model %s (%s)", self.model_name, self._compute_type)
                self._model = WhisperModel(
                    self.model_name, device=self._device, compute_type=self._compute_type
                )
            return self._model

    def transcribe(
        self,
        audio_path: Path,
        language: str | None,
        prompt: str | None,
        on_progress: ProgressCallback,
    ) -> TranscriptionResult:
        model = self._get_model()
        segments_iter, info = model.transcribe(
            str(audio_path),
            language=language,
            initial_prompt=prompt,
            word_timestamps=True,
            # Spike: without VAD Whisper hallucinates text on music/silence ("Terima kasih.")
            vad_filter=True,
        )
        segments: list[SegmentData] = []
        for seg in segments_iter:
            words = [
                WordData(start=w.start, end=w.end, word=w.word, probability=w.probability)
                for w in (seg.words or [])
            ]
            segments.append(
                SegmentData(start=seg.start, end=seg.end, text=seg.text.strip(), words=words)
            )
            if info.duration:
                on_progress(min(seg.end / info.duration, 1.0))
        return TranscriptionResult(
            language=info.language, duration=info.duration, segments=segments
        )
