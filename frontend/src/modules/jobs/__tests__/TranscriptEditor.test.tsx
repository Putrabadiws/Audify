import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders, SEGMENTS } from "@/test/utils";

import TranscriptEditor from "../components/TranscriptEditor";

afterEach(() => {
  vi.restoreAllMocks();
});

function renderEditor(currentTime = 0, onSeek = vi.fn()) {
  renderWithProviders(
    <TranscriptEditor jobId="job-1" segments={SEGMENTS} currentTime={currentTime} onSeek={onSeek} />,
  );
  return onSeek;
}

describe("TranscriptEditor", () => {
  it("renders every segment with its timestamp", () => {
    renderEditor();
    expect(screen.getByText("Selamat pagi semua.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "00:08" })).toBeInTheDocument();
  });

  it("seeks and plays when a segment text or timestamp is clicked", async () => {
    const onSeek = renderEditor();
    await userEvent.click(screen.getByText("Let's review the budget."));
    expect(onSeek).toHaveBeenCalledWith(2, true);
    await userEvent.click(screen.getByRole("button", { name: "00:08" }));
    expect(onSeek).toHaveBeenCalledWith(8, true);
  });

  it("highlights the segment at the current playback time", () => {
    renderEditor(3.2);
    const active = screen.getByText("Let's review the budget.").closest("[data-active]");
    expect(active).toHaveAttribute("data-active", "true");
    const inactive = screen.getByText("Selamat pagi semua.").closest("[data-active]");
    expect(inactive).toHaveAttribute("data-active", "false");
  });

  it("saves an edited segment on Enter", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ id: 1, idx: 0, start: 0, end: 2, text: "Pagi semua." }));
    renderEditor();

    await userEvent.dblClick(screen.getByText("Selamat pagi semua."));
    const box = screen.getByRole("textbox", { name: "Edit segment at 00:00" });
    await userEvent.clear(box);
    await userEvent.type(box, "Pagi semua.{Enter}");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/jobs/job-1/segments/1");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ text: "Pagi semua." }));
  });

  it("discards the edit on Escape without calling the API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    renderEditor();

    await userEvent.dblClick(screen.getByText("Oke, terima kasih."));
    await userEvent.type(screen.getByRole("textbox"), " extra{Escape}");

    expect(screen.getByText("Oke, terima kasih.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not save when the text is unchanged or emptied", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    renderEditor();

    await userEvent.dblClick(screen.getByText("Selamat pagi semua."));
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.keyboard("{Enter}");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Selamat pagi semua.")).toBeInTheDocument();
  });

  it("shows an empty state when no speech was detected", () => {
    renderWithProviders(<TranscriptEditor jobId="job-1" segments={[]} currentTime={0} onSeek={vi.fn()} />);
    expect(screen.getByText("No speech was detected in this file.")).toBeInTheDocument();
  });
});
