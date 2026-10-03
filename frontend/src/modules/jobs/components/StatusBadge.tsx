import type { JobStatus } from "../api/jobsApi";
import styles from "./StatusBadge.module.css";

interface StatusBadgeProps {
  status: JobStatus;
  progress: number;
}

const LABELS: Record<JobStatus, string> = {
  queued: "Queued",
  processing: "Transcribing",
  done: "Done",
  failed: "Failed",
};

const StatusBadge = ({ status, progress }: StatusBadgeProps) => {
  const label = status === "processing" ? `${LABELS.processing} ${Math.round(progress * 100)}%` : LABELS[status];
  return (
    <span className={`${styles.badge} ${styles[status]}`} data-status={status}>
      {label}
    </span>
  );
};

export default StatusBadge;
