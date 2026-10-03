import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ActionCards from "../components/ActionCards";
import { pickFormat, recordingFilename } from "../hooks/useRecorder";

/** Minimal MediaRecorder stand-in: emits one chunk on stop, like a real timeslice flush. */
class FakeMediaRecorder {
  static supported = new Set(["audio/webm;codecs=opus", "audio/webm"]);
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported(type: string) {
    return FakeMediaRecorder.supported.has(type);
  }

  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  readonly mimeType: string;
  emitData = true;

  constructor(_stream: MediaStream, options: { mimeType: string }) {
    this.mimeType = options.mimeType;
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    if (this.emitData) this.ondataavailable?.({ data: new Blob(["audio-bytes"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const trackStop = vi.fn();
const getUserMedia = vi.fn();

beforeEach(() => {
  FakeMediaRecorder.instances = [];
  FakeMediaRecorder.supported = new Set(["audio/webm;codecs=opus", "audio/webm"]);
  trackStop.mockReset();
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
});

describe("ActionCards record card", () => {
  it("records, then hands a named webm File to onFiles and releases the mic", async () => {
    const onFiles = vi.fn();
    render(<ActionCards onFiles={onFiles} onOpenSettings={vi.fn()} isBusy={false} />);

    await userEvent.click(screen.getByRole("button", { name: /^Record/ }));
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    const stopButton = await screen.findByRole("button", { name: /Stop · 00:00/ });

    await userEvent.click(stopButton);

    expect(onFiles).toHaveBeenCalledTimes(1);
    const [file]: File[] = onFiles.mock.calls[0][0];
    expect(file.name).toMatch(/^Recording \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}\.webm$/);
    expect(file.type).toBe("audio/webm;codecs=opus");
    expect(trackStop).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Record/ })).toBeEnabled();
  });

  it("shows a helpful message when microphone permission is denied", async () => {
    getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    render(<ActionCards onFiles={vi.fn()} onOpenSettings={vi.fn()} isBusy={false} />);

    await userEvent.click(screen.getByRole("button", { name: /^Record/ }));

    expect(await screen.findByText(/Microphone access was denied/)).toBeInTheDocument();
    expect(FakeMediaRecorder.instances).toHaveLength(0);
  });

  it("does not upload an empty recording", async () => {
    const onFiles = vi.fn();
    render(<ActionCards onFiles={onFiles} onOpenSettings={vi.fn()} isBusy={false} />);
    await userEvent.click(screen.getByRole("button", { name: /^Record/ }));
    await screen.findByRole("button", { name: /Stop/ });

    FakeMediaRecorder.instances[0].emitData = false;
    await userEvent.click(screen.getByRole("button", { name: /Stop/ }));

    expect(onFiles).not.toHaveBeenCalled();
    expect(trackStop).toHaveBeenCalled();
  });

  it("frees the mic and discards the recording when unmounted mid-recording", async () => {
    const onFiles = vi.fn();
    const { unmount } = render(<ActionCards onFiles={onFiles} onOpenSettings={vi.fn()} isBusy={false} />);
    await userEvent.click(screen.getByRole("button", { name: /^Record/ }));
    await screen.findByRole("button", { name: /Stop/ });

    act(() => unmount());

    expect(trackStop).toHaveBeenCalled();
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("tells the user when the browser cannot record", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    render(<ActionCards onFiles={vi.fn()} onOpenSettings={vi.fn()} isBusy={false} />);
    expect(screen.getByText("Not supported in this browser")).toBeInTheDocument();
  });

  it("updates the timer while recording", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<ActionCards onFiles={vi.fn()} onOpenSettings={vi.fn()} isBusy={false} />);
      await userEvent.click(screen.getByRole("button", { name: /^Record/ }));
      await screen.findByRole("button", { name: /Stop · 00:00/ });

      act(() => vi.advanceTimersByTime(3200));

      await waitFor(() => expect(screen.getByRole("button", { name: /Stop · 00:03/ })).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("pickFormat", () => {
  it("falls back to mp4 on Safari-like browsers", () => {
    FakeMediaRecorder.supported = new Set(["audio/mp4"]);
    expect(pickFormat()).toEqual({ mimeType: "audio/mp4", extension: ".m4a" });
  });

  it("returns null when no format is supported", () => {
    FakeMediaRecorder.supported = new Set();
    expect(pickFormat()).toBeNull();
  });
});

describe("recordingFilename", () => {
  it("builds a sortable, filesystem-safe name", () => {
    expect(recordingFilename(new Date(2026, 8, 28, 9, 5, 7), ".webm")).toBe("Recording 2026-09-28 09.05.07.webm");
  });
});

describe("ActionCards import & settings", () => {
  it("passes chosen files to onFiles and resets the input", async () => {
    const onFiles = vi.fn();
    render(<ActionCards onFiles={onFiles} onOpenSettings={vi.fn()} isBusy={false} />);
    const input = screen.getByTestId("file-input");
    const file = new File(["x"], "rapat.m4a", { type: "audio/mp4" });

    await userEvent.upload(input, file);

    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(input).toHaveValue("");
  });

  it("opens settings and shows the busy state", async () => {
    const onOpenSettings = vi.fn();
    render(<ActionCards onFiles={vi.fn()} onOpenSettings={onOpenSettings} isBusy />);
    await userEvent.click(screen.getByRole("button", { name: /^Settings/ }));
    expect(onOpenSettings).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Uploading/ })).toBeDisabled();
  });
});
