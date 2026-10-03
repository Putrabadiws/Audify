import { useState } from "react";
import { Copy, Download, Pencil, RefreshCw, Sparkles } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { errorMessage } from "@/lib/apiClient";

import { aiProblem, isSummaryBusy } from "../api/summaryApi";
import type { Summary } from "../api/summaryApi";
import { useAIStatus, useGenerateSummary, useSaveSummary, useSummary } from "../hooks/useSummary";
import styles from "./SummaryPanel.module.css";

interface SummaryPanelProps {
  jobId: string;
  jobTitle: string;
  isTranscriptReady: boolean;
}

function downloadMarkdown(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename} - summary.md`;
  link.click();
  URL.revokeObjectURL(url);
}

const SummaryPanel = ({ jobId, jobTitle, isTranscriptReady }: SummaryPanelProps) => {
  const { data: summary, error: loadError } = useSummary(jobId);
  const { data: aiStatus } = useAIStatus();
  const generate = useGenerateSummary(jobId);
  const problem = aiProblem(aiStatus);

  const handleGenerate = () => {
    if (summary?.edited && !window.confirm("Regenerating replaces your edits to the summary. Continue?")) return;
    generate.mutate();
  };

  const canGenerate = isTranscriptReady && !problem && !generate.isPending;

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <h2>Meeting notes</h2>
        {summary?.status === "done" && (
          <button type="button" className="ghost" onClick={handleGenerate} disabled={!canGenerate}>
            <RefreshCw size={14} /> Regenerate
          </button>
        )}
      </header>

      {problem && <p className={styles.warning}>{problem}</p>}
      {loadError && <p className="error-text">{errorMessage(loadError)}</p>}
      {generate.isError && <p className="error-text">{errorMessage(generate.error)}</p>}

      {summary && (
        <SummaryBody
          summary={summary}
          jobId={jobId}
          jobTitle={jobTitle}
          isTranscriptReady={isTranscriptReady}
          canGenerate={canGenerate}
          onGenerate={handleGenerate}
        />
      )}
    </div>
  );
};

interface SummaryBodyProps {
  summary: Summary;
  jobId: string;
  jobTitle: string;
  isTranscriptReady: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
}

const SummaryBody = ({ summary, jobId, jobTitle, isTranscriptReady, canGenerate, onGenerate }: SummaryBodyProps) => {
  if (summary.status === "none") {
    return (
      <div className={styles.empty}>
        <span className={styles.sparkle}>
          <Sparkles size={22} />
        </span>
        <p className="muted">
          Generate meeting minutes — summary, key points, decisions and action items — with a local AI model. Nothing
          leaves this computer.
        </p>
        <button type="button" className="primary" onClick={onGenerate} disabled={!canGenerate}>
          Generate summary
        </button>
        {!isTranscriptReady && <p className="muted">Available once the transcript is done.</p>}
      </div>
    );
  }

  if (isSummaryBusy(summary.status)) {
    return (
      <div className={styles.empty}>
        <p>{summary.status === "queued" ? "Waiting in queue…" : "Writing summary…"}</p>
        <progress value={summary.progress} max={1} />
        <p className="muted">About 4 minutes per 10 minutes of audio on this machine. You can leave this page.</p>
      </div>
    );
  }

  if (summary.status === "failed") {
    return (
      <div className={styles.empty}>
        <p className="error-text">Summary failed: {summary.error}</p>
        <button type="button" onClick={onGenerate} disabled={!canGenerate}>
          Try again
        </button>
      </div>
    );
  }

  return <SummaryContent summary={summary} jobId={jobId} jobTitle={jobTitle} />;
};

const SummaryContent = ({ summary, jobId, jobTitle }: { summary: Summary; jobId: string; jobTitle: string }) => {
  const save = useSaveSummary(jobId);
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(summary.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  if (draft !== null) {
    return (
      <div className={styles.content}>
        <textarea
          className={styles.editor}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Edit summary"
          maxLength={50_000}
        />
        <div className={styles.actions}>
          <button
            type="button"
            className="primary"
            disabled={save.isPending || !draft.trim()}
            onClick={() => save.mutate(draft, { onSuccess: () => setDraft(null) })}
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setDraft(null)}>
            Cancel
          </button>
          {save.isError && <span className="error-text">{errorMessage(save.error)}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.content}>
      <div className={styles.markdown}>
        {/* gfm: renders the "- [ ]" action items as checkboxes */}
        <Markdown remarkPlugins={[remarkGfm]}>{summary.content}</Markdown>
      </div>
      <div className={styles.actions}>
        <button type="button" onClick={() => void handleCopy()}>
          <Copy size={14} /> {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={() => downloadMarkdown(jobTitle, summary.content)}>
          <Download size={14} /> Download .md
        </button>
        <button type="button" onClick={() => setDraft(summary.content)}>
          <Pencil size={14} /> Edit
        </button>
      </div>
      <p className={`muted ${styles.footnote}`}>
        {summary.model}
        {summary.edited && " · edited"} · AI can make mistakes; check names and numbers against the transcript.
      </p>
    </div>
  );
};

export default SummaryPanel;
