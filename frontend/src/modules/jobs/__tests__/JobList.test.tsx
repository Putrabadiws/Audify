import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeJob, renderWithProviders } from "@/test/utils";

import JobList from "../components/JobList";
import StatusBadge from "../components/StatusBadge";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("JobList", () => {
  it("shows an empty state", () => {
    renderWithProviders(<JobList jobs={[]} />);
    expect(screen.getByText("No transcripts yet")).toBeInTheDocument();
  });

  it("links each job to its editor and shows duration + language", () => {
    renderWithProviders(<JobList jobs={[makeJob()]} />);
    expect(screen.getByRole("link", { name: /Rapat Q4/ })).toHaveAttribute("href", "/jobs/job-1");
    expect(screen.getByText(/02:05 · Indonesian · large-v3-turbo/)).toBeInTheDocument();
  });

  it("shows the error for failed jobs", () => {
    renderWithProviders(<JobList jobs={[makeJob({ status: "failed", error: "ffmpeg failed" })]} />);
    expect(screen.getByText("ffmpeg failed")).toBeInTheDocument();
  });

  it("only deletes after confirmation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderWithProviders(<JobList jobs={[makeJob()]} />);

    const button = screen.getByRole("button", { name: "Delete Rapat Q4" });
    await userEvent.click(button);
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("DELETE");
  });

  it("disables delete while a job is processing", () => {
    renderWithProviders(<JobList jobs={[makeJob({ status: "processing", progress: 0.4 })]} />);
    expect(screen.getByRole("button", { name: "Delete Rapat Q4" })).toBeDisabled();
  });
});

describe("StatusBadge", () => {
  it("shows percentage while processing", () => {
    renderWithProviders(<StatusBadge status="processing" progress={0.426} />);
    expect(screen.getByText("Transcribing 43%")).toBeInTheDocument();
  });

  it("labels terminal states", () => {
    renderWithProviders(<StatusBadge status="failed" progress={0} />);
    expect(screen.getByText("Failed")).toHaveAttribute("data-status", "failed");
  });
});
