import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus = "idle" | "requesting" | "recording" | "error";

interface RecordingFormat {
  mimeType: string;
  extension: string;
}

// Order matters: Chrome/Firefox record webm/opus; Safari only supports mp4/aac.
// Both extensions are on the backend allow-list and are transcoded to m4a for playback.
const FORMATS: readonly RecordingFormat[] = [
  { mimeType: "audio/webm;codecs=opus", extension: ".webm" },
  { mimeType: "audio/webm", extension: ".webm" },
  { mimeType: "audio/mp4", extension: ".m4a" },
  { mimeType: "audio/ogg;codecs=opus", extension: ".ogg" },
];

// Emit a chunk every second so a crash/tab close mid-recording loses at most ~1 s,
// instead of everything buffered until stop().
const TIMESLICE_MS = 1000;

export function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export function pickFormat(): RecordingFormat | null {
  if (!isRecordingSupported()) return null;
  return FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mimeType)) ?? null;
}

export function recordingFilename(date: Date, extension: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
  return `Recording ${stamp}${extension}`;
}

function describeError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") return "Microphone access was denied. Allow it in the browser's site settings.";
    if (err.name === "NotFoundError") return "No microphone found.";
    if (err.name === "NotReadableError") return "The microphone is in use by another app.";
  }
  return err instanceof Error ? err.message : "Could not start recording.";
}

/** Microphone recorder; calls `onRecorded` with a ready-to-upload File when stopped. */
export function useRecorder(onRecorded: (file: File) => void) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const onRecordedRef = useRef(onRecorded);

  useEffect(() => {
    onRecordedRef.current = onRecorded;
  }, [onRecorded]);

  const releaseMic = useCallback(() => {
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    // stopping the tracks turns off the browser's "recording" indicator
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    const format = pickFormat();
    if (!format) {
      setStatus("error");
      setError("This browser can't record audio.");
      return;
    }
    setStatus("requesting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: format.mimeType });
      const chunks: Blob[] = [];
      const startedAt = new Date();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        releaseMic();
        setStatus("idle");
        setElapsed(0);
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: format.mimeType });
        onRecordedRef.current(new File([blob], recordingFilename(startedAt, format.extension), { type: format.mimeType }));
      };

      recorder.start(TIMESLICE_MS);
      recorderRef.current = recorder;
      setElapsed(0);
      setStatus("recording");
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
      }, 500);
    } catch (err) {
      releaseMic();
      setStatus("error");
      setError(describeError(err));
    }
  }, [releaseMic]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recorderRef.current = null;
  }, []);

  // Leaving the page mid-recording: drop the recording and free the mic.
  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      releaseMic();
    },
    [releaseMic],
  );

  return { status, error, elapsed, isSupported: isRecordingSupported(), start, stop };
}
