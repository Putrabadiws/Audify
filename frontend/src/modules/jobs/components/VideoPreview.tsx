import type { MediaRef, Player } from "../hooks/usePlayer";
import styles from "./VideoPreview.module.css";

interface VideoPreviewProps {
  mediaRef: MediaRef;
  player: Player;
  src: string;
  /** The browser can't show this video (unsupported container/codec) → caller falls back to audio. */
  onUnplayable: () => void;
}

/**
 * The original upload, played in place of the hidden <audio>: the PlayerBar drives it through
 * usePlayer, so there are no native controls (one set of controls, one clock).
 */
const VideoPreview = ({ mediaRef, player, src, onUnplayable }: VideoPreviewProps) => (
  <div className={styles.frame}>
    <video
      ref={mediaRef}
      className={styles.video}
      src={src}
      preload="metadata"
      playsInline
      onClick={player.toggle}
      onError={onUnplayable}
      // Best effort: some browsers decode the sound but not the picture (e.g. an unsupported
      // video codec) and report no error — only a 0×0 frame. Audio-only mode is clearer then.
      onLoadedMetadata={(e) => {
        if (e.currentTarget.videoWidth === 0) onUnplayable();
      }}
      aria-label="Video preview"
    />
  </div>
);

export default VideoPreview;
