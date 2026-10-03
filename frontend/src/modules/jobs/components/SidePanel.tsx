import { useState } from "react";
import type { ReactNode } from "react";

import SegmentedControl from "@/components/ui/SegmentedControl";
import { formatDuration } from "@/lib/time";

import type { JobDetail } from "../api/jobsApi";
import { languageLabel } from "../constants";
import SummaryPanel from "./SummaryPanel";
import styles from "./SidePanel.module.css";

type Tab = "summary" | "info";

const TABS = [
  { value: "summary", label: "AI Summary" },
  { value: "info", label: "Info" },
] as const satisfies readonly { value: Tab; label: string }[];

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

interface SidePanelProps {
  job: JobDetail;
  /** Video preview pinned above the tabs (video files only). */
  video?: ReactNode;
  /**
   * Hidden by the user. With a video the panel stays mounted but invisible: unmounting the
   * <video> would stop playback, and it is the element the PlayerBar is driving.
   */
  collapsed?: boolean;
}

/** Right-hand panel of the editor (unified panel): Summary | Info. */
// Update: now the LEFT column (user's call 2026-10-01: video + summary left, transcript right).
const SidePanel = ({ job, video, collapsed = false }: SidePanelProps) => {
  const [tab, setTab] = useState<Tab>("summary");

  return (
    <aside className={styles.panel} aria-label="Side panel" hidden={collapsed}>
      {video}
      {!collapsed && (
        <>
          <div className={styles.tabs}>
            <SegmentedControl label="Side panel" options={TABS} value={tab} onChange={setTab} />
          </div>
          <div className={styles.body}>
            {tab === "summary" ? (
              <SummaryPanel jobId={job.id} jobTitle={job.title} isTranscriptReady={job.status === "done"} />
            ) : (
              <InfoPanel job={job} />
            )}
          </div>
        </>
      )}
    </aside>
  );
};

const InfoPanel = ({ job }: { job: JobDetail }) => {
  const words = job.segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
  const rows: [string, string][] = [
    ["Duration", formatDuration(job.duration)],
    ["Words", job.status === "done" ? words.toLocaleString() : "—"],
    ["Segments", job.status === "done" ? String(job.segments.length) : "—"],
    ["Language", job.language == null ? "Auto-detect" : languageLabel(job.language)],
    ["Detected", job.detected_language ?? "—"],
    ["Model", job.model ?? "—"],
    ["Original file", job.original_filename],
    ["Created", dateFormat.format(new Date(job.created_at))],
    ["Updated", dateFormat.format(new Date(job.updated_at))],
  ];

  return (
    <div className={styles.info}>
      <dl className={styles.list}>
        {rows.map(([k, v]) => (
          <div key={k} className={styles.row}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.vocab}>
        <h3>Vocabulary</h3>
        <p className={job.vocabulary ? undefined : "muted"}>{job.vocabulary || "None for this file."}</p>
      </div>
    </div>
  );
};

export default SidePanel;
