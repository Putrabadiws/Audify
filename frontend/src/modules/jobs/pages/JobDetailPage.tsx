import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Clock, Cpu, Languages, PanelLeft, RotateCcw } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { errorMessage } from "@/lib/apiClient";
import { formatDuration } from "@/lib/time";

import { isActive, jobsApi } from "../api/jobsApi";
import type { JobDetail } from "../api/jobsApi";
import ExportMenu from "../components/ExportMenu";
import PlayerBar from "../components/PlayerBar";
import RetranscribePanel from "../components/RetranscribePanel";
import SidePanel from "../components/SidePanel";
import StatusBadge from "../components/StatusBadge";
import TagEditor from "../components/TagEditor";
import TranscriptEditor from "../components/TranscriptEditor";
import VideoPreview from "../components/VideoPreview";
import { languageLabel } from "../constants";
import { useJob, useRenameJob } from "../hooks/useJobs";
import { usePlayer } from "../hooks/usePlayer";
import styles from "./JobDetailPage.module.css";

const PANEL_KEY = "audify-side-panel";

const JobDetailPage = () => {
  const { jobId = "" } = useParams();
  const { data: job, isLoading, error } = useJob(jobId);

  if (isLoading) return <p className={`muted ${styles.message}`}>Loading…</p>;
  if (error || !job) {
    return (
      <div className={styles.message}>
        <p className="error-text">Could not load this file: {errorMessage(error)}</p>
        <Link to="/files">← Back to files</Link>
      </div>
    );
  }
  return <JobDetailView job={job} />;
};

const JobDetailView = ({ job }: { job: JobDetail }) => {
  const { mediaRef, player } = usePlayer();
  const rename = useRenameJob(job.id);
  const [isRetranscribing, setIsRetranscribing] = useState(false);
  const busy = isActive(job.status);
  const [showPanel, setShowPanel] = useState(() => window.localStorage.getItem(PANEL_KEY) !== "closed");
  const [searchParams] = useSearchParams();
  const startAt = Number(searchParams.get("t"));
  const hasJumped = useRef(false);
  const { hasMedia, seek } = player;
  // Video files play the original in the side panel; if the browser can't decode it we drop
  // back to the transcoded audio for the rest of the visit (no retry loop on every render).
  const [videoUnplayable, setVideoUnplayable] = useState(false);
  // same gate as the PlayerBar below: duration is set once the worker has converted the media
  const hasPlayback = job.duration != null;
  const showVideo = hasPlayback && job.has_video && !videoUnplayable;

  // Deep link from a search hit (?t=12.3): cue the audio there once media is attached, so the
  // matching segment is highlighted and scrolled into view. No autoplay — the user didn't press play.
  useEffect(() => {
    if (!hasMedia || hasJumped.current || !Number.isFinite(startAt) || startAt <= 0) return;
    hasJumped.current = true;
    seek(startAt);
  }, [hasMedia, seek, startAt]);

  const togglePanel = () => {
    setShowPanel((v) => {
      window.localStorage.setItem(PANEL_KEY, v ? "closed" : "open");
      return !v;
    });
  };

  const handleTitleBlur = (value: string) => {
    const title = value.trim();
    if (title && title !== job.title) rename.mutate(title);
  };

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <Link to="/files" className={styles.back} aria-label="Back to files">
          <ChevronLeft size={18} />
        </Link>
        <div className={styles.titleBlock}>
          <input
            key={job.title}
            className={styles.title}
            defaultValue={job.title}
            onBlur={(e) => handleTitleBlur(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            aria-label="Title"
          />
          <div className={styles.meta}>
            <StatusBadge status={job.status} progress={job.progress} />
            <span className={styles.chip}>
              <Clock size={12} /> {formatDuration(job.duration)}
            </span>
            <span className={styles.chip}>
              <Languages size={12} /> {languageLabel(job.detected_language ?? job.language)}
            </span>
            {job.model && (
              <span className={styles.chip}>
                <Cpu size={12} /> {job.model}
              </span>
            )}
          </div>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => setIsRetranscribing((v) => !v)}
            disabled={busy}
            title="Transcribe again with another language or vocabulary"
          >
            <RotateCcw size={15} /> Re-transcribe
          </button>
          <ExportMenu jobId={job.id} disabled={job.status !== "done"} />
          <button
            type="button"
            className={`icon ${showPanel ? styles.toggleOn : ""}`}
            onClick={togglePanel}
            aria-pressed={showPanel}
            aria-label={showPanel ? "Hide side panel" : "Show side panel"}
            title="Summary & info"
          >
            <PanelLeft size={17} />
          </button>
        </div>
      </header>

      <TagEditor jobId={job.id} tags={job.tags} />
      {isRetranscribing && <RetranscribePanel job={job} onClose={() => setIsRetranscribing(false)} />}
      {rename.isError && <p className={`error-text ${styles.inlineError}`}>Rename failed: {errorMessage(rename.error)}</p>}

      <div className={`${styles.columns} ${showPanel ? styles.withPanel : ""}`}>
        {/* side panel first = left column, transcript right (user's call 2026-10-01) */}
        {(showPanel || showVideo) && (
          <SidePanel
            job={job}
            collapsed={!showPanel}
            video={
              showVideo && (
                <VideoPreview
                  mediaRef={mediaRef}
                  player={player}
                  src={jobsApi.videoUrl(job.id)}
                  onUnplayable={() => setVideoUnplayable(true)}
                />
              )
            }
          />
        )}
        <section className={styles.body} aria-label="Transcript">
          {busy && (
            <div className={styles.progress}>
              <p>{job.status === "queued" ? "Waiting in queue…" : "Transcribing…"}</p>
              <progress value={job.progress} max={1} />
              <p className="muted">Roughly 30–40 minutes per hour of audio on this machine. You can leave this page.</p>
            </div>
          )}
          {job.status === "failed" && (
            <div className={styles.progress}>
              <p className="error-text">Transcription failed: {job.error}</p>
              <button type="button" onClick={() => setIsRetranscribing(true)}>
                Try again
              </button>
            </div>
          )}
          {job.status === "done" && (
            <TranscriptEditor jobId={job.id} segments={job.segments} currentTime={player.currentTime} onSeek={player.seek} />
          )}
        </section>
      </div>

      {/* media exists once the worker has converted it, even while still transcribing */}
      {/* with a video preview the bar drives the <video>, so it renders no <audio> of its own */}
      {hasPlayback && (
        <PlayerBar mediaRef={mediaRef} player={player} src={showVideo ? undefined : jobsApi.mediaUrl(job.id)} />
      )}
    </div>
  );
};

export default JobDetailPage;
