import { memo, useEffect, useRef, useState } from "react";
import { Check, Copy, Pencil, Play } from "lucide-react";

import { formatTime } from "@/lib/time";

import type { Segment } from "../api/jobsApi";
import styles from "./TranscriptEditor.module.css";

interface SegmentRowProps {
  segment: Segment;
  isActive: boolean;
  isSaving: boolean;
  onSeek: (time: number) => void;
  onSave: (segmentId: number, text: string) => void;
}

// memo: only the previously- and newly-active rows re-render on each timeupdate tick.
const SegmentRow = memo(({ segment, isActive, isSaving, onSeek, onSave }: SegmentRowProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(segment.text);
  const [copied, setCopied] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive && !isEditing) rowRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [isActive, isEditing]);

  // Draft is seeded when editing starts (not synced by an effect), so a server refresh of
  // segment.text can't clobber what the user is typing.
  const startEditing = () => {
    setDraft(segment.text);
    setIsEditing(true);
  };

  const commit = () => {
    setIsEditing(false);
    const text = draft.trim();
    if (text && text !== segment.text) onSave(segment.id, text);
  };

  const handleCopy = async () => {
    await navigator.clipboard?.writeText(segment.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const stamp = formatTime(segment.start);

  return (
    <div ref={rowRef} className={`${styles.segment} ${isActive ? styles.active : ""}`} data-active={isActive}>
      <div className={styles.segmentHead}>
        <button type="button" className={styles.time} onClick={() => onSeek(segment.start)} title="Play from here">
          {stamp}
        </button>
        {!isEditing && (
          <div className={styles.tools}>
            <button type="button" className="ghost icon" onClick={() => onSeek(segment.start)} aria-label={`Play from ${stamp}`}>
              <Play size={13} />
            </button>
            <button type="button" className="ghost icon" onClick={() => void handleCopy()} aria-label={`Copy segment at ${stamp}`}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <button type="button" className="ghost icon" onClick={startEditing} aria-label={`Edit segment at ${stamp}`}>
              <Pencil size={13} />
            </button>
          </div>
        )}
      </div>
      {isEditing ? (
        <textarea
          className={styles.editor}
          value={draft}
          autoFocus
          rows={Math.max(2, Math.ceil(draft.length / 90))}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setIsEditing(false);
            }
          }}
          aria-label={`Edit segment at ${stamp}`}
        />
      ) : (
        <p
          className={styles.text}
          onClick={() => onSeek(segment.start)}
          onDoubleClick={startEditing}
          title="Click to play · double-click to edit"
        >
          {segment.text}
          {isSaving && <span className="muted"> · saving…</span>}
        </p>
      )}
    </div>
  );
});

SegmentRow.displayName = "SegmentRow";

export default SegmentRow;
