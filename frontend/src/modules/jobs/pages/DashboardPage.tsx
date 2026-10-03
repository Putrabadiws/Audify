import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { useShell } from "@/components/AppShell/shellContext";
import { errorMessage } from "@/lib/apiClient";

import ActionCards from "../components/ActionCards";
import JobList from "../components/JobList";
import { LANGUAGE_OPTIONS } from "../constants";
import { useJobList } from "../hooks/useJobs";
import { useUploadFiles, useUploadOptions } from "../hooks/useUploadFiles";
import styles from "./Pages.module.css";

const RECENT_COUNT = 5;
const NO_FILTERS = { tagId: null, query: "" };

const DashboardPage = () => {
  const { openSettings } = useShell();
  const { options, setOptions } = useUploadOptions();
  const { uploadFiles, isUploading, failures } = useUploadFiles();
  const { data: jobs, isLoading, error } = useJobList(NO_FILTERS);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <h1 className="page-title">Welcome to Audify</h1>
        <p className="muted">Drop audio or video files anywhere, or use the shortcuts below.</p>
      </header>

      <ActionCards onFiles={(files) => void uploadFiles(files, options)} onOpenSettings={openSettings} isBusy={isUploading} />

      <div className={styles.options}>
        <label className={styles.option}>
          <span>Language</span>
          <select value={options.language} onChange={(e) => setOptions({ language: e.target.value })}>
            {LANGUAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className={`${styles.option} ${styles.grow}`}>
          <span>Vocabulary for new files</span>
          <input
            value={options.vocabulary}
            onChange={(e) => setOptions({ vocabulary: e.target.value })}
            placeholder="Names, brands, jargon — e.g. Chitato, hak cipta, CPA"
            maxLength={2000}
          />
        </label>
      </div>
      {failures.length > 0 && <p className="error-text">Upload failed: {failures.join(", ")}</p>}

      <section>
        <div className={styles.sectionHead}>
          <h2>Recent</h2>
          {jobs && jobs.length > RECENT_COUNT && (
            <Link to="/files" className={styles.link}>
              View all <ArrowRight size={14} />
            </Link>
          )}
        </div>
        {isLoading && <p className="muted">Loading…</p>}
        {error && <p className="error-text">Could not load files: {errorMessage(error)}</p>}
        {jobs && <JobList jobs={jobs.slice(0, RECENT_COUNT)} />}
      </section>
    </div>
  );
};

export default DashboardPage;
