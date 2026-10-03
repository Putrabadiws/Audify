import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyTheme, readStoredTheme, useTheme } from "../theme";

function mockSystemDark(dark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: dark, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  mockSystemDark(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("theme", () => {
  it("defaults to auto and ignores garbage in storage", () => {
    expect(readStoredTheme()).toBe("auto");
    localStorage.setItem("audify-theme", "purple");
    expect(readStoredTheme()).toBe("auto");
  });

  it("applyTheme sets or clears data-theme", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("auto");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("auto follows the system; toggle flips the visible theme and persists it", () => {
    mockSystemDark(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("auto");
    expect(result.current.isDark).toBe(true);

    act(() => result.current.toggle());

    expect(result.current.theme).toBe("light");
    expect(result.current.isDark).toBe(false);
    expect(localStorage.getItem("audify-theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("restores the saved theme on load", () => {
    localStorage.setItem("audify-theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
