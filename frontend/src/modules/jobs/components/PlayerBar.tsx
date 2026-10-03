import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";

import { formatTime } from "@/lib/time";

import { PLAYBACK_RATES } from "../hooks/usePlayer";
import type { MediaRef, Player } from "../hooks/usePlayer";
import styles from "./PlayerBar.module.css";

interface PlayerBarProps {
  mediaRef: MediaRef;
  player: Player;
  /** Playback audio URL. Omitted when a <video> preview is the media element instead. */
  src?: string;
}

const SKIP_SECONDS = 5;

const PlayerBar = ({ mediaRef, player, src }: PlayerBarProps) => {
  const progress = player.duration ? (player.currentTime / player.duration) * 100 : 0;

  return (
    <div className={styles.bar}>
      {src && <audio ref={mediaRef} src={src} preload="metadata" />}
      <div className={styles.controls}>
        <button type="button" className="ghost icon" onClick={() => player.skip(-SKIP_SECONDS)} aria-label="Back 5 seconds">
          <RotateCcw size={17} />
        </button>
        <button type="button" className={styles.play} onClick={player.toggle} aria-label={player.isPlaying ? "Pause" : "Play"}>
          {player.isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <button type="button" className="ghost icon" onClick={() => player.skip(SKIP_SECONDS)} aria-label="Forward 5 seconds">
          <RotateCw size={17} />
        </button>
      </div>
      <span className={styles.clock}>{formatTime(player.currentTime)}</span>
      <input
        className={styles.scrubber}
        type="range"
        min={0}
        max={player.duration || 0}
        step={0.1}
        value={player.currentTime}
        onChange={(e) => player.seek(Number(e.target.value))}
        aria-label="Seek"
        // filled part of the track as a gradient: there is no cross-browser "progress" pseudo-element
        style={{ background: `linear-gradient(to right, var(--accent) ${progress}%, var(--border-strong) ${progress}%)` }}
      />
      <span className={styles.clock}>{formatTime(player.duration)}</span>
      <select
        className={styles.rate}
        value={player.rate}
        onChange={(e) => player.setRate(Number(e.target.value))}
        aria-label="Playback speed"
      >
        {PLAYBACK_RATES.map((r) => (
          <option key={r} value={r}>
            {r}x
          </option>
        ))}
      </select>
    </div>
  );
};

export default PlayerBar;
