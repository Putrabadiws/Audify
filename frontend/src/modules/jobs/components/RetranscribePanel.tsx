import { useState } from "react";

import { errorMessage } from "@/lib/apiClient";

import type { Job } from "../api/jobsApi";
import { LANGUAGE_OPTIONS } from "../constants";
import { useRetranscribe } from "../hooks/useJobs";
import styles from "../pages/JobDetailPage.module.css";

interface RetranscribePanelProps {
  job: Job;
  onClose: () => void;
}

const RetranscribePanel = ({ job, onClose }: RetranscribePanelProps) => {
  const [language, setLanguage] = useState(job.language ?? "auto");
  const [vocabulary, setVocabulary] = useState(job.vocabulary);
  const retranscribe = useRetranscribe(job.id);

  const handleSubmit = () => {
    retranscribe.mutate({ language, vocabulary }, { onSuccess: onClose });
  };

  return (
    <div className={styles.panel}>
      <p className="muted">
        Re-run transcription with a different language or vocabulary. Your manual edits will be replaced.
      </p>
      <div className={styles.panelRow}>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language">
          {LANGUAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          className={styles.grow}
          value={vocabulary}
          onChange={(e) => setVocabulary(e.target.value)}
          placeholder="Vocabulary: names, brands, jargon"
          maxLength={2000}
          aria-label="Vocabulary"
        />
        <button type="button" className="primary" onClick={handleSubmit} disabled={retranscribe.isPending}>
          Transcribe again
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
      {retranscribe.isError && <p className="error-text">{errorMessage(retranscribe.error)}</p>}
    </div>
  );
};

export default RetranscribePanel;
