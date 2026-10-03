import { act, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, makeJob, renderWithProviders, SEGMENTS } from "@/test/utils";

import ExportMenu from "../components/ExportMenu";
import SidePanel from "../components/SidePanel";
import { readUploadOptions, useUploadOptions } from "../hooks/useUploadFiles";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ExportMenu", () => {
  it("opens a popover, picks a format and downloads with the right URL", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const hrefs: string[] = [];
    click.mockImplementation(function (this: HTMLAnchorElement) {
      hrefs.push(this.getAttribute("href") ?? "");
    });
    renderWithProviders(<ExportMenu jobId="job-1" disabled={false} />);

    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    await userEvent.click(screen.getByRole("radio", { name: /Subtitles/ }));
    expect(screen.queryByLabelText("Include timestamps")).toBeNull(); // SRT always has timings
    await userEvent.click(screen.getByRole("button", { name: "Download .srt" }));

    expect(hrefs).toEqual(["/api/v1/jobs/job-1/export?format=srt&timestamps=true"]);
    expect(screen.queryByRole("dialog", { name: "Export transcript" })).toBeNull();
  });

  it("offers the timestamp toggle for text formats and closes on Escape", async () => {
    renderWithProviders(<ExportMenu jobId="job-1" disabled={false} />);
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    expect(screen.getByLabelText("Include timestamps")).toBeChecked();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is disabled until the transcript is done", () => {
    renderWithProviders(<ExportMenu jobId="job-1" disabled />);
    expect(screen.getByRole("button", { name: /Export/ })).toBeDisabled();
  });
});

describe("SidePanel", () => {
  it("switches to Info and shows transcript stats", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse({ status: "none", progress: 0, content: "", error: null, model: null, edited: false, updated_at: null }));
    const job = { ...makeJob({ vocabulary: "Chitato" }), segments: SEGMENTS, has_video: false };
    renderWithProviders(<SidePanel job={job} />);

    await userEvent.click(screen.getByRole("radio", { name: "Info" }));

    // "Selamat pagi semua." (3) + "Let's review the budget." (4) + "Oke, terima kasih." (3)
    expect(screen.getByText("Words").nextSibling).toHaveTextContent("10");
    expect(screen.getByText("Segments").nextSibling).toHaveTextContent("3");
    expect(screen.getByText("Chitato")).toBeInTheDocument();
  });
});

describe("upload options", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to Indonesian and persists changes", () => {
    const { result } = renderHook(() => useUploadOptions());
    expect(result.current.options).toEqual({ language: "id", vocabulary: "" });
    act(() => result.current.setOptions({ vocabulary: "Chitato" }));
    expect(readUploadOptions()).toEqual({ language: "id", vocabulary: "Chitato" });
  });

  it.each([
    ["not json", "{oops"],
    ["unknown language", JSON.stringify({ language: "xx", vocabulary: "" })],
    ["wrong types", JSON.stringify({ language: "en", vocabulary: 5 })],
  ])("falls back to defaults on %s", (_label, stored) => {
    localStorage.setItem("audify-upload-options", stored);
    expect(readUploadOptions()).toEqual({ language: "id", vocabulary: "" });
  });
});
