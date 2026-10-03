import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/utils";

import type { AIStatus, Summary } from "../api/summaryApi";
import SummaryPanel from "../components/SummaryPanel";

const READY: AIStatus = {
  reachable: true,
  model: "qwen3.5:4b",
  model_installed: true,
  installed_models: ["qwen3.5:4b"],
  error: null,
};

function summary(overrides: Partial<Summary> = {}): Summary {
  return {
    status: "done",
    progress: 1,
    content: "## Ringkasan\nRapat membahas **budget**.\n\n## Action Items\n- [ ] Daniel siapkan proposal",
    error: null,
    model: "qwen3.5:4b",
    edited: false,
    updated_at: "2026-09-29T10:00:00Z",
    ...overrides,
  };
}

/** GET summary → `current`; POST/PUT → `after`; /ai/status → `ai`. */
function mockApi(current: Summary, { ai = READY, after = current }: { ai?: AIStatus; after?: Summary } = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/ai/status")) return jsonResponse(ai);
    if (init?.method === "POST") return jsonResponse(after, { status: 202 });
    if (init?.method === "PUT") return jsonResponse(after);
    return jsonResponse(current);
  });
}

function renderPanel(isTranscriptReady = true) {
  renderWithProviders(<SummaryPanel jobId="job-1" jobTitle="Rapat Q4" isTranscriptReady={isTranscriptReady} />);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SummaryPanel", () => {
  it("offers to generate when there is no summary yet", async () => {
    const fetchMock = mockApi(summary({ status: "none", content: "", model: null }), {
      after: summary({ status: "queued", progress: 0, content: "" }),
    });
    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: "Generate summary" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, i]) => String(u) === "/api/v1/jobs/job-1/summary" && i?.method === "POST")).toBe(
        true,
      ),
    );
    expect(await screen.findByText("Waiting in queue…")).toBeInTheDocument();
  });

  it("renders the markdown summary as formatted text", async () => {
    mockApi(summary());
    renderPanel();
    expect(await screen.findByRole("heading", { name: "Ringkasan" })).toBeInTheDocument();
    expect(screen.getByText("budget").tagName).toBe("STRONG");
    expect(screen.getByText(/AI can make mistakes/)).toBeInTheDocument();
  });

  it("does not render raw HTML from the model", async () => {
    mockApi(summary({ content: 'Hasil <img src=x onerror="alert(1)"> <script>alert(2)</script>' }));
    const { container } = { container: document.body };
    renderPanel();
    await screen.findByText(/Hasil/);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("shows progress while generating", async () => {
    mockApi(summary({ status: "processing", progress: 0.5, content: "" }));
    renderPanel();
    expect(await screen.findByText("Writing summary…")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "0.5");
  });

  it("shows the error and lets the user retry", async () => {
    mockApi(summary({ status: "failed", content: "", error: "Ollama is not running" }));
    renderPanel();
    expect(await screen.findByText("Summary failed: Ollama is not running")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("explains how to fix a missing Ollama and disables generation", async () => {
    mockApi(summary({ status: "none", content: "" }), {
      ai: { ...READY, reachable: false, model_installed: false, installed_models: [], error: "down" },
    });
    renderPanel();
    expect(await screen.findByText(/Ollama is not running/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate summary" })).toBeDisabled();
  });

  it("disables generation until the transcript is done", async () => {
    mockApi(summary({ status: "none", content: "" }));
    renderPanel(false);
    expect(await screen.findByText("Available once the transcript is done.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate summary" })).toBeDisabled();
  });

  it("edits and saves the summary", async () => {
    const fetchMock = mockApi(summary(), { after: summary({ content: "## Ringkasan\nEdited", edited: true }) });
    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const box = screen.getByRole("textbox", { name: "Edit summary" });
    await userEvent.clear(box);
    await userEvent.type(box, "## Ringkasan{enter}Edited");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Edited")).toBeInTheDocument());
    const put = fetchMock.mock.calls.find(([, i]) => i?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ content: "## Ringkasan\nEdited" });
    expect(screen.getByText(/· edited/)).toBeInTheDocument();
  });

  it("asks before regenerating over manual edits", async () => {
    const fetchMock = mockApi(summary({ edited: true }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: "Regenerate" }));

    expect(confirm).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === "POST")).toBe(false);
  });
});

describe("SummaryPanel markdown", () => {
  it("renders action items as checkboxes, not literal brackets", async () => {
    mockApi(summary());
    renderPanel();
    expect(await screen.findByRole("checkbox")).toBeInTheDocument();
    expect(screen.queryByText(/\[ \]/)).toBeNull();
  });
});
