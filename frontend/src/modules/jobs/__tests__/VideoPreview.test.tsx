import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { jsonResponse, makeJob, renderWithProviders, SEGMENTS } from "@/test/utils";

import JobDetailPage from "../pages/JobDetailPage";

const NO_SUMMARY = { status: "none", progress: 0, content: "", error: null, model: null, edited: false, updated_at: null };

/** Detail page with the API stubbed; the summary route must come first (it shares the prefix). */
function renderDetail(hasVideo: boolean) {
  const job = { ...makeJob({ original_filename: hasVideo ? "rapat.mp4" : "rapat.m4a" }), segments: SEGMENTS, has_video: hasVideo };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith("/api/v1/jobs/job-1/summary")) return jsonResponse(NO_SUMMARY);
    if (url.startsWith("/api/v1/jobs/job-1")) return jsonResponse(job);
    return jsonResponse([]);
  });
  return renderWithProviders(
    <Routes>
      <Route path="/jobs/:jobId" element={<JobDetailPage />} />
    </Routes>,
    { route: "/jobs/job-1" },
  );
}

const video = () => document.querySelector("video");
const audio = () => document.querySelector("audio");

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("JobDetailPage video preview", () => {
  it("plays the original video in the left panel, with the transcript on the right", async () => {
    renderDetail(true);
    await screen.findByText("Selamat pagi semua.");

    expect(video()).toHaveAttribute("src", "/api/v1/jobs/job-1/video");
    // one media element only: the PlayerBar drives the video instead of a second <audio>
    expect(audio()).toBeNull();

    const panel = screen.getByRole("complementary", { name: "Side panel" });
    const transcript = screen.getByRole("region", { name: "Transcript" });
    expect(panel.compareDocumentPosition(transcript) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(panel.contains(video())).toBe(true);
  });

  it("audio-only files keep the audio player and show no video", async () => {
    renderDetail(false);
    await screen.findByText("Selamat pagi semua.");

    expect(video()).toBeNull();
    expect(audio()).toHaveAttribute("src", "/api/v1/jobs/job-1/media");
  });

  it("falls back to the audio player when the browser can't play the video", async () => {
    renderDetail(true);
    await screen.findByText("Selamat pagi semua.");
    const el = video();
    if (!el) throw new Error("video not rendered");

    fireEvent.error(el);

    expect(video()).toBeNull();
    expect(audio()).toHaveAttribute("src", "/api/v1/jobs/job-1/media");
  });

  it("falls back when only the sound decodes (no picture: videoWidth 0)", async () => {
    renderDetail(true);
    await screen.findByText("Selamat pagi semua.");
    const el = video();
    if (!el) throw new Error("video not rendered");
    Object.defineProperty(el, "videoWidth", { value: 0, configurable: true });

    fireEvent.loadedMetadata(el);

    expect(video()).toBeNull();
    expect(audio()).not.toBeNull();
  });

  it("keeps the video mounted (so playback continues) when the side panel is hidden", async () => {
    renderDetail(true);
    await screen.findByText("Selamat pagi semua.");

    fireEvent.click(screen.getByRole("button", { name: "Hide side panel" }));

    expect(video()).not.toBeNull();
    // queried directly: Testing Library won't resolve accessible names of hidden elements
    const panel = document.querySelector("aside");
    expect(panel).not.toBeNull();
    expect(panel).not.toBeVisible();
    expect(panel?.contains(video())).toBe(true);
    expect(screen.queryByRole("radio", { name: "AI Summary" })).toBeNull();
  });
});
