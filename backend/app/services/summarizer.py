import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from app.services.exporters import format_timestamp
from app.services.llm import ChatMessage, LLMClient, LLMError

logger = logging.getLogger(__name__)

# ~10k chars ≈ 3k tokens of Indonesian: fits num_ctx 8192 with room for the prompt and the
# answer. Bigger windows make a 4B model's KV cache blow past free RAM on an 8 GB Mac.
CHUNK_CHARS = 10_000
NUM_CTX = 8192

SYSTEM_PROMPT = """You write meeting minutes from a raw speech-to-text transcript.
Rules:
- Write in the dominant language of the transcript. If it is Indonesian or mixed
  Indonesian-English, write in Indonesian and keep English business terms as spoken.
- Only use facts from the transcript. Never invent names, numbers, dates or decisions.
- The transcript comes from automatic speech recognition and may contain mis-heard words;
  prefer the most plausible reading, don't quote obvious errors.
- Be concise and specific. Output GitHub-flavoured Markdown only, no preamble."""

FINAL_FORMAT = """Use exactly these sections (translate the headings to English if you are
writing in English). Under a section with nothing to report write "- Tidak ada" / "- None".

## Ringkasan
3–6 sentences: purpose, main outcomes, overall direction.

## Poin Penting
- the key discussion points, one bullet each, most important first

## Keputusan
- decisions that were actually made

## Action Items
One line per task. Add " — <name>" only if a person's name is said, and
" — <deadline>" only if a date/day is said. Examples:
- [ ] Kirim laporan CPA ke klien — Budi — Senin
- [ ] Siapkan proposal budget — Jumat
- [ ] Cek ulang data engagement
Never write "Speaker", "Penutur", "TBD" or similar placeholders.

## Pertanyaan Terbuka
- unresolved questions or follow-ups"""

MAP_INSTRUCTION = """This is part {part} of {total} of a longer transcript. Write compact notes
for this part only: key points, decisions, action items (with owner/deadline if said), open
questions. Bullet points, keep [mm:ss] timestamps for important items. No final summary yet."""


@dataclass
class TranscriptLine:
    start: float
    text: str


ProgressCallback = Callable[[float], None]


def render_transcript(lines: Sequence[TranscriptLine]) -> str:
    return "\n".join(f"[{format_timestamp(ln.start, with_hours=False)}] {ln.text}" for ln in lines)


def chunk_lines(lines: Sequence[TranscriptLine], max_chars: int) -> list[str]:
    """Split on segment boundaries so no sentence is cut in half between chunks."""
    chunks: list[str] = []
    current: list[str] = []
    size = 0
    for ln in lines:
        row = f"[{format_timestamp(ln.start, with_hours=False)}] {ln.text}"
        if current and size + len(row) + 1 > max_chars:
            chunks.append("\n".join(current))
            current, size = [], 0
        current.append(row)
        size += len(row) + 1
    if current:
        chunks.append("\n".join(current))
    return chunks


class Summarizer:
    """Map-reduce summary: short transcripts in one call, long ones summarized per chunk first."""

    def __init__(self, client: LLMClient, chunk_chars: int = CHUNK_CHARS):
        self.client = client
        self.chunk_chars = chunk_chars

    def _ask(self, instruction: str, body: str) -> str:
        messages = [
            ChatMessage("system", SYSTEM_PROMPT),
            ChatMessage("user", f"{instruction}\n\n---\n{body}"),
        ]
        answer = self.client.chat(messages, num_ctx=NUM_CTX)
        if not answer.strip():
            raise LLMError("The AI model returned an empty answer. Try regenerating.")
        return answer.strip()

    def summarize(
        self, title: str, lines: Sequence[TranscriptLine], on_progress: ProgressCallback
    ) -> str:
        if not lines:
            raise LLMError("This transcript is empty — nothing to summarize.")
        chunks = chunk_lines(lines, self.chunk_chars)
        header = f"Title: {title}\n\n"

        if len(chunks) == 1:
            on_progress(0.1)
            result = self._ask(FINAL_FORMAT, header + "Transcript:\n" + chunks[0])
            on_progress(1.0)
            return result

        # map: one note sheet per chunk. Steps = chunks + 1 final call.
        total_steps = len(chunks) + 1
        notes: list[str] = []
        for i, chunk in enumerate(chunks, 1):
            logger.info("summary map step %d/%d", i, len(chunks))
            notes.append(self._ask(MAP_INSTRUCTION.format(part=i, total=len(chunks)), chunk))
            on_progress(i / total_steps)

        # reduce: if the notes themselves are too long, compress them pairwise first
        combined = self._reduce_notes(notes)
        result = self._ask(
            FINAL_FORMAT + "\n\nBelow are notes from consecutive parts of the meeting.",
            header + combined,
        )
        on_progress(1.0)
        return result

    def _reduce_notes(self, notes: list[str]) -> str:
        joined = "\n\n".join(f"### Part {i}\n{n}" for i, n in enumerate(notes, 1))
        while len(joined) > self.chunk_chars and len(notes) > 1:
            merged: list[str] = []
            for i in range(0, len(notes), 2):
                pair = "\n\n".join(notes[i : i + 2])
                merged.append(
                    self._ask("Merge these meeting notes into one compact list of notes.", pair)
                    if i + 1 < len(notes)
                    else notes[i]
                )
            notes = merged
            joined = "\n\n".join(f"### Part {i}\n{n}" for i, n in enumerate(notes, 1))
        return joined
