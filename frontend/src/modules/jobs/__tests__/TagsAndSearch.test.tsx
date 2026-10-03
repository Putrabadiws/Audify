import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, makeJob, renderWithProviders } from "@/test/utils";

import JobList from "../components/JobList";
import TagEditor from "../components/TagEditor";
import JobsPage from "../pages/JobsPage";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Route fetches by path so each component gets the response it expects. */
function mockApi(routes: Record<string, unknown>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.startsWith(`/api/v1${k}`));
    return jsonResponse(key ? routes[key] : []);
  });
}

describe("JobList search results", () => {
  it("shows tags and highlighted snippets that deep-link to the segment time", () => {
    const job = makeJob({
      tags: [{ id: 1, name: "Meeting" }],
      matches: [{ segment_id: 7, start: 83.4, text: "Campaign Chitato naik." }],
    });
    renderWithProviders(<JobList jobs={[job]} query="chitato" isFiltered />);

    expect(screen.getByText("Meeting")).toBeInTheDocument();
    // located by href: jsdom drops the spaces between highlight <span>s when computing names
    const link = screen.getAllByRole("link").find((a) => a.getAttribute("href") === "/jobs/job-1?t=83.4");
    expect(link).toBeDefined();
    if (!link) return;
    expect(link).toHaveTextContent("01:23Campaign Chitato naik.");
    expect(within(link).getByText("Chitato").tagName).toBe("MARK");
  });

  it("distinguishes 'no matches' from an empty library", () => {
    const { unmount } = renderWithProviders(<JobList jobs={[]} isFiltered />);
    expect(screen.getByText("No matches")).toBeInTheDocument();
    unmount();
    renderWithProviders(<JobList jobs={[]} />);
    expect(screen.getByText("No transcripts yet")).toBeInTheDocument();
  });
});

describe("JobsPage (Files) filters from the URL", () => {
  it("searches with ?q= and shows a clearable chip", async () => {
    const fetchMock = mockApi({ "/jobs": [makeJob()], "/tags": [] });
    renderWithProviders(<JobsPage />, { route: "/files?q=budget" });

    expect(await screen.findByText("“budget”")).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u) === "/api/v1/jobs?q=budget")).toBe(true),
    );
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u) === "/api/v1/jobs")).toBe(true));
  });

  it("filters by ?tag= and titles the page with the tag name", async () => {
    const fetchMock = mockApi({ "/jobs": [makeJob()], "/tags": [{ id: 3, name: "Client", job_count: 1 }] });
    renderWithProviders(<JobsPage />, { route: "/files?tag=3" });

    expect(await screen.findByRole("heading", { name: "Client" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u) === "/api/v1/jobs?tag=3")).toBe(true);
  });

  it.each(["abc", "-1", "1.5", "3x"])("ignores a malformed tag id %s", async (bad) => {
    const fetchMock = mockApi({ "/jobs": [], "/tags": [] });
    renderWithProviders(<JobsPage />, { route: `/files?tag=${bad}` });
    expect(await screen.findByRole("heading", { name: "All files" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("tag="))).toBe(false);
  });
});

describe("TagEditor", () => {
  function setup(tags = [{ id: 1, name: "Meeting" }]) {
    const fetchMock = mockApi({ "/tags": [], "/jobs/job-1/tags": makeJob({ tags }) });
    renderWithProviders(<TagEditor jobId="job-1" tags={tags} />);
    const putBodies = () =>
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT").map(([, init]) => JSON.parse(String(init?.body)));
    return { putBodies };
  }

  it("adds a tag on Enter, trimming a trailing comma", async () => {
    const { putBodies } = setup();
    await userEvent.type(screen.getByRole("combobox", { name: "Add tag" }), "Q4 budget,");
    await waitFor(() => expect(putBodies()).toEqual([{ tags: ["Meeting", "Q4 budget"] }]));
  });

  it("ignores a case-insensitive duplicate", async () => {
    const { putBodies } = setup();
    await userEvent.type(screen.getByRole("combobox", { name: "Add tag" }), "meeting{Enter}");
    expect(putBodies()).toEqual([]);
  });

  it("removes a tag with × and with Backspace on an empty input", async () => {
    const { putBodies } = setup([
      { id: 1, name: "Meeting" },
      { id: 2, name: "Q4" },
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Remove tag Meeting" }));
    await userEvent.type(screen.getByRole("combobox", { name: "Add tag" }), "{Backspace}");
    await waitFor(() => expect(putBodies()).toEqual([{ tags: ["Q4"] }, { tags: ["Meeting"] }]));
  });
});
