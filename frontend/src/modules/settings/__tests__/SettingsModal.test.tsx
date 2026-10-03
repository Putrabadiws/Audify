import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/utils";

import SettingsModal from "../pages/SettingsModal";

const SETTINGS = { vocabulary: "Chitato", default_language: "id", whisper_model: "large-v3-turbo" };
const AI_READY = { reachable: true, model: "qwen3.5:4b", model_installed: true, installed_models: [], error: null };

/** /settings GET → `settings`, PUT → `saved`; /ai/status → `ai`. */
function mockApi(settings: unknown, { saved = settings, ai = AI_READY as unknown } = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input).endsWith("/ai/status")) return jsonResponse(ai);
    if (init?.method === "PUT") return jsonResponse(saved);
    return typeof settings === "function" ? settings() : jsonResponse(settings);
  });
}

function renderModal(props: Partial<Parameters<typeof SettingsModal>[0]> = {}) {
  const onClose = vi.fn();
  const onThemeChange = vi.fn();
  renderWithProviders(
    <SettingsModal onClose={onClose} theme="auto" onThemeChange={onThemeChange} {...props} />,
  );
  return { onClose, onThemeChange };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SettingsModal", () => {
  it("changes appearance from the General section", async () => {
    mockApi(SETTINGS);
    const { onThemeChange } = renderModal();
    expect(screen.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(onThemeChange).toHaveBeenCalledWith("dark");
  });

  it("closes with Esc and the close button", async () => {
    mockApi(SETTINGS);
    const { onClose } = renderModal();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("loads the saved vocabulary and only enables Save when changed", async () => {
    mockApi(SETTINGS);
    renderModal({ initialSection: "transcription" });

    const box = await screen.findByRole("textbox", { name: "Global vocabulary" });
    expect(box).toHaveValue("Chitato");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.type(box, ", TikTok");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("PUTs the new vocabulary and re-disables Save", async () => {
    const fetchMock = mockApi(SETTINGS, { saved: { ...SETTINGS, vocabulary: "Chitato, TikTok" } });
    renderModal();
    await userEvent.click(screen.getByRole("button", { name: /Transcription/ }));

    await userEvent.type(await screen.findByRole("textbox"), ", TikTok");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([, i]) => i?.method === "PUT")).toBe(true));
    const put = fetchMock.mock.calls.find(([, i]) => i?.method === "PUT");
    expect(put?.[1]?.body).toBe(JSON.stringify({ vocabulary: "Chitato, TikTok" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDisabled());
  });

  it("shows an error when settings cannot load", async () => {
    mockApi(() => jsonResponse({ detail: "db locked" }, { status: 500 }));
    renderModal({ initialSection: "transcription" });
    expect(await screen.findByText(/db locked/)).toBeInTheDocument();
  });

  it("shows AI readiness and how to fix a stopped Ollama", async () => {
    mockApi(SETTINGS, { ai: { ...AI_READY, reachable: false, model_installed: false, error: "down" } });
    renderModal({ initialSection: "ai" });
    expect(await screen.findByText(/Start it with `ollama serve`/)).toBeInTheDocument();
  });

  it("shows the model when AI is ready", async () => {
    mockApi(SETTINGS);
    renderModal({ initialSection: "ai" });
    expect(await screen.findByText("qwen3.5:4b")).toBeInTheDocument();
  });
});
