import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { jsonResponse } from "@/test/utils";

import { ApiError, apiRequest, errorMessage } from "../apiClient";

const Schema = z.object({ id: z.string() });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("apiRequest", () => {
  it("parses a valid response and sends a request id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ id: "a" }));
    await expect(apiRequest("/jobs/a", Schema)).resolves.toEqual({ id: "a" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/jobs/a");
    expect(new Headers(init?.headers).get("X-Request-ID")).toMatch(/^[0-9a-f]{12}$/);
  });

  it("throws ApiError with the FastAPI detail string", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "Job not found: x" }, { status: 404, headers: { "X-Request-ID": "srv123" } }),
    );
    const err = await apiRequest("/jobs/x", Schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(errorMessage(err)).toBe("Job not found: x (ref srv123)");
  });

  it("joins 422 validation messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: [{ msg: "field required" }, { msg: "too long" }] }, { status: 422 }),
    );
    const err = await apiRequest("/jobs", Schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err instanceof ApiError && err.message).toBe("field required; too long");
  });

  it("rejects a malformed success body instead of trusting it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ id: 42 }));
    await expect(apiRequest("/jobs/a", Schema)).rejects.toBeInstanceOf(z.ZodError);
  });

  it("falls back to status text when the error body is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>bad gateway</html>", { status: 502, statusText: "Bad Gateway" }),
    );
    const err = await apiRequest("/jobs", Schema).catch((e: unknown) => e);
    expect(err instanceof ApiError && err.message).toBe("Bad Gateway");
  });
});

describe("errorMessage", () => {
  it("handles non-Error values", () => {
    expect(errorMessage("boom")).toBe("Something went wrong");
    expect(errorMessage(new Error("plain"))).toBe("plain");
  });
});
