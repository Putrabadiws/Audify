/** 65.4 → "01:05", 3661 → "1:01:01". Negative/NaN clamp to "00:00". */
export function formatTime(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export interface TimedSpan {
  start: number;
  end: number;
}

/**
 * Index of the segment playing at `time`, or -1.
 * Binary search: called on every `timeupdate` (~4x/s) over transcripts with thousands of
 * segments. In a gap between segments we keep the previous one highlighted so the highlight
 * doesn't flicker off during pauses in speech.
 */
export function findActiveSegmentIndex(segments: readonly TimedSpan[], time: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].start <= time) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

export function formatDuration(seconds: number | null): string {
  return seconds == null ? "—" : formatTime(seconds);
}
