import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

import type { JobListItem, Segment } from "@/modules/jobs/api/jobsApi";

export function renderWithProviders(ui: ReactElement, { route = "/" }: { route?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

export function makeJob(overrides: Partial<JobListItem> = {}): JobListItem {
  return {
    id: "job-1",
    title: "Rapat Q4",
    original_filename: "rapat.m4a",
    status: "done",
    progress: 1,
    error: null,
    language: "id",
    detected_language: "id",
    vocabulary: "",
    model: "large-v3-turbo",
    duration: 125,
    created_at: "2026-09-27T10:00:00Z",
    updated_at: "2026-09-27T10:05:00Z",
    tags: [],
    matches: [],
    ...overrides,
  };
}

export const SEGMENTS: Segment[] = [
  { id: 1, idx: 0, start: 0, end: 2, text: "Selamat pagi semua." },
  { id: 2, idx: 1, start: 2, end: 5, text: "Let's review the budget." },
  { id: 3, idx: 2, start: 8, end: 10, text: "Oke, terima kasih." },
];
