import { useCallback, useEffect, useRef, useState } from "react";

export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;

export interface PlayerState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  rate: number;
}

const INITIAL_STATE: PlayerState = { currentTime: 0, duration: 0, isPlaying: false, rate: 1 };

/**
 * Owns one <audio> element; components get state + imperative controls.
 * Update: one media element — <audio>, or the <video> preview for video files. Both are
 * HTMLMediaElement, so the controls are identical; the element may be swapped at runtime
 * (video that won't decode falls back to audio) and the callback ref simply re-attaches.
 *
 * Callback ref: the <audio> only mounts once the backend has produced playback media, which
 * can be long after this hook mounts — a plain ref + mount-only effect would never attach the
 * listeners. The element is mirrored into state (to re-run the listener effect) and into a ref
 * (for imperative writes like currentTime, which React forbids on state values).
 */
export function usePlayer() {
  const [media, setMedia] = useState<HTMLMediaElement | null>(null);
  const mediaElRef = useRef<HTMLMediaElement | null>(null);
  const [state, setState] = useState<PlayerState>(INITIAL_STATE);

  const mediaRef = useCallback((el: HTMLMediaElement | null) => {
    mediaElRef.current = el;
    setMedia(el);
  }, []);

  useEffect(() => {
    if (!media) return;
    const sync = () =>
      setState((s) => ({
        ...s,
        currentTime: media.currentTime,
        duration: Number.isFinite(media.duration) ? media.duration : s.duration,
        isPlaying: !media.paused,
      }));
    const events = ["timeupdate", "loadedmetadata", "play", "pause", "ended", "seeked"] as const;
    events.forEach((e) => media.addEventListener(e, sync));
    return () => events.forEach((e) => media.removeEventListener(e, sync));
  }, [media]);

  const seek = useCallback((time: number, autoplay = false) => {
    const el = mediaElRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, time);
    // update immediately so the highlight follows the click even before `seeked` fires
    setState((s) => ({ ...s, currentTime: el.currentTime }));
    if (autoplay) void el.play().catch(() => undefined);
  }, []);

  const toggle = useCallback(() => {
    const el = mediaElRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  }, []);

  const skip = useCallback((delta: number) => {
    const el = mediaElRef.current;
    if (el) el.currentTime = Math.max(0, el.currentTime + delta);
  }, []);

  const setRate = useCallback((rate: number) => {
    const el = mediaElRef.current;
    if (el) el.playbackRate = rate;
    setState((s) => ({ ...s, rate }));
  }, []);

  return { mediaRef, player: { ...state, hasMedia: media !== null, seek, toggle, skip, setRate } };
}

export type Player = ReturnType<typeof usePlayer>["player"];
export type MediaRef = ReturnType<typeof usePlayer>["mediaRef"];
