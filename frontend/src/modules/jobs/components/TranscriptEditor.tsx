import { useCallback, useMemo } from "react";

import { errorMessage } from "@/lib/apiClient";
import { findActiveSegmentIndex } from "@/lib/time";

import type { Segment } from "../api/jobsApi";
import { useUpdateSegment } from "../hooks/useJobs";
import SegmentRow from "./SegmentRow";
import styles from "./TranscriptEditor.module.css";

interface TranscriptEditorProps {
  jobId: string;
  segments: Segment[];
  currentTime: number;
  onSeek: (time: number, autoplay?: boolean) => void;
}

const TranscriptEditor = ({ jobId, segments, currentTime, onSeek }: TranscriptEditorProps) => {
  const update = useUpdateSegment(jobId);
  const activeIndex = useMemo(() => findActiveSegmentIndex(segments, currentTime), [segments, currentTime]);

  const handleSeek = useCallback((time: number) => onSeek(time, true), [onSeek]);
  const { mutate } = update;
  const handleSave = useCallback((segmentId: number, text: string) => mutate({ segmentId, text }), [mutate]);

  if (segments.length === 0) {
    return <p className="muted">No speech was detected in this file.</p>;
  }

  return (
    <div className={styles.transcript}>
      {update.isError && <p className="error-text">Save failed: {errorMessage(update.error)}</p>}
      {segments.map((segment, i) => (
        <SegmentRow
          key={segment.id}
          segment={segment}
          isActive={i === activeIndex}
          isSaving={update.isPending && update.variables?.segmentId === segment.id}
          onSeek={handleSeek}
          onSave={handleSave}
        />
      ))}
    </div>
  );
};

export default TranscriptEditor;
