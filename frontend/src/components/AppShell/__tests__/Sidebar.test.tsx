import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/utils";

import Sidebar from "../Sidebar";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockTags(tags: unknown[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse(tags));
}

describe("Sidebar", () => {
  it("links each tag to the filtered Files page with its count", async () => {
    mockTags([{ id: 3, name: "Client", job_count: 2 }]);
    renderWithProviders(<Sidebar />);
    const link = await screen.findByRole("link", { name: /Client\s*2/ });
    expect(link).toHaveAttribute("href", "/files?tag=3");
  });

  it("highlights only the active tag, not All files, when filtering", async () => {
    mockTags([{ id: 3, name: "Client", job_count: 2 }]);
    renderWithProviders(<Sidebar />, { route: "/files?tag=3" });
    const tag = await screen.findByRole("link", { name: /Client/ });
    expect(tag.className).toMatch(/navActive/);
    expect(screen.getByRole("link", { name: /All files/ }).className).not.toMatch(/navActive/);
  });

  it("highlights All files without a tag filter", async () => {
    mockTags([]);
    renderWithProviders(<Sidebar />, { route: "/files" });
    expect((await screen.findByRole("link", { name: /All files/ })).className).toMatch(/navActive/);
    expect(screen.getByText(/Add tags from a file's page/)).toBeInTheDocument();
  });
});
