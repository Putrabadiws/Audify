import { useRef } from "react";
import { FileAudio, Mic, SlidersHorizontal, Square } from "lucide-react";

import { formatTime } from "@/lib/time";

import { ACCEPTED_MEDIA } from "../constants";
import { useRecorder } from "../hooks/useRecorder";
import styles from "./ActionCards.module.css";

interface ActionCardsProps {
  onFiles: (files: File[]) => void;
  onOpenSettings: () => void;
  isBusy: boolean;
}

/** Dashboard shortcut tiles: Import · Record · Settings. */
const ActionCards = ({ onFiles, onOpenSettings, isBusy }: ActionCardsProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const recorder = useRecorder((file) => onFiles([file]));
  const isRecording = recorder.status === "recording";

  return (
    <div className={styles.grid}>
      <button type="button" className={styles.card} onClick={() => inputRef.current?.click()} disabled={isBusy}>
        <span className={`${styles.icon} ${styles.blue}`}>
          <FileAudio size={22} />
        </span>
        <strong>{isBusy ? "Uploading…" : "Import"}</strong>
        <span className={styles.sub}>Audio or video file</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_MEDIA}
        multiple
        hidden
        data-testid="file-input"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      {recorder.isSupported ? (
        <button
          type="button"
          className={`${styles.card} ${isRecording ? styles.recording : ""}`}
          onClick={() => (isRecording ? recorder.stop() : void recorder.start())}
          disabled={isBusy || recorder.status === "requesting"}
        >
          <span className={`${styles.icon} ${styles.red}`}>{isRecording ? <Square size={18} /> : <Mic size={22} />}</span>
          <strong>
            {isRecording ? `Stop · ${formatTime(recorder.elapsed)}` : recorder.status === "requesting" ? "Waiting for mic…" : "Record"}
          </strong>
          <span className={styles.sub}>{recorder.error ?? (isRecording ? "Recording from microphone" : "Microphone")}</span>
        </button>
      ) : (
        <div className={`${styles.card} ${styles.disabled}`}>
          <span className={`${styles.icon} ${styles.red}`}>
            <Mic size={22} />
          </span>
          <strong>Record</strong>
          <span className={styles.sub}>Not supported in this browser</span>
        </div>
      )}

      <button type="button" className={styles.card} onClick={onOpenSettings}>
        <span className={`${styles.icon} ${styles.gray}`}>
          <SlidersHorizontal size={22} />
        </span>
        <strong>Settings</strong>
        <span className={styles.sub}>Vocabulary, AI, appearance</span>
      </button>
    </div>
  );
};

export default ActionCards;
