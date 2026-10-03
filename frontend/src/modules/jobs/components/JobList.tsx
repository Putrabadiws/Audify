import { AudioLines, Inbox, SearchX, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { errorMessage } from "@/lib/apiClient";
import { splitHighlight } from "@/lib/highlight";
import { formatDuration, formatTime } from "@/lib/time";

import { isActive } from "../api/jobsApi";
import type { JobListItem } from "../api/jobsApi";
import { languageLabel } from "../constants";
import { useDeleteJob } from "../hooks/useJobs";
import StatusBadge from "./StatusBadge";
import styles from "./JobList.module.css";
import tagStyles from "./Tags.module.css";

interface JobListProps {
  jobs: JobListItem[];
  query?: string;
  isFiltered?: boolean;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const Highlighted = ({ text, query }: { text: string; query: string }) => (
  <>
    {splitHighlight(text, query).map((part, i) =>
      part.isMatch ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>,
    )}
  </>
);

const JobList = ({ jobs, query = "", isFiltered = false }: JobListProps) => {
  const remove = useDeleteJob();

  if (jobs.length === 0) {
    return isFiltered ? (
      <div className={styles.empty}>
        <SearchX size={36} strokeWidth={1.5} className={styles.emptyIcon} />
        <strong>No matches</strong>
        <span className="muted">Try another word or clear the filters.</span>
      </div>
    ) : (
      <div className={styles.empty}>
        <Inbox size={36} strokeWidth={1.5} className={styles.emptyIcon} />
        <strong>No transcripts yet</strong>
        <span className="muted">Upload an audio or video file to create one.</span>
      </div>
    );
  }

  const handleDelete = (job: JobListItem) => {
    if (window.confirm(`Delete "${job.title}" and its audio? This cannot be undone.`)) {
      remove.mutate(job.id);
    }
  };

  return (
    <>
      {remove.isError && <p className="error-text">Delete failed: {errorMessage(remove.error)}</p>}
      <ul className={styles.list}>
        {jobs.map((job) => (
          <li key={job.id} className={styles.row}>
            <div className={styles.body}>
              <div className={styles.head}>
                <span className={styles.fileIcon}>
                  <AudioLines size={16} />
                </span>
                <Link to={`/jobs/${job.id}`} className={styles.main}>
                  <span className={styles.title}>
                    <Highlighted text={job.title} query={query} />
                  </span>
                  <span className={`muted ${styles.meta}`}>
                    {formatDuration(job.duration)} · {languageLabel(job.detected_language ?? job.language)}
                    {job.model ? ` · ${job.model}` : ""} · {dateFormat.format(new Date(job.created_at))}
                  </span>
                </Link>
                <StatusBadge status={job.status} progress={job.progress} />
                <button
                  type="button"
                  className={`ghost icon danger ${styles.delete}`}
                  onClick={() => handleDelete(job)}
                  disabled={job.status === "processing"}
                  title={isActive(job.status) ? "Wait for transcription to finish" : "Delete"}
                  aria-label={`Delete ${job.title}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {job.tags.length > 0 && (
                <div className={styles.tags}>
                  {job.tags.map((t) => (
                    <span key={t.id} className={`${tagStyles.chip} ${tagStyles.static}`}>
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
              {job.status === "failed" && job.error && <span className="error-text">{job.error}</span>}
              {job.matches.length > 0 && (
                <ul className={styles.matches}>
                  {job.matches.map((m) => (
                    <li key={m.segment_id}>
                      {/* ?t= makes the editor jump to (and highlight) the matching segment */}
                      <Link to={`/jobs/${job.id}?t=${m.start}`} className={styles.match}>
                        <span className={styles.matchTime}>{formatTime(m.start)}</span>
                        <span>
                          <Highlighted text={m.text} query={query} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
};

export default JobList;
