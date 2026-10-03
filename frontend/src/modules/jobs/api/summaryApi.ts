import { z } from "zod";

import { apiRequest } from "@/lib/apiClient";

// "none" = never generated for this job
export const SummaryStatusSchema = z.enum(["none", "queued", "processing", "done", "failed"]);
export type SummaryStatus = z.infer<typeof SummaryStatusSchema>;

export const SummarySchema = z.object({
  status: SummaryStatusSchema,
  progress: z.number(),
  content: z.string(),
  error: z.string().nullable(),
  model: z.string().nullable(),
  edited: z.boolean(),
  updated_at: z.string().nullable(),
});
export type Summary = z.infer<typeof SummarySchema>;

export const AIStatusSchema = z.object({
  reachable: z.boolean(),
  model: z.string(),
  model_installed: z.boolean(),
  installed_models: z.array(z.string()),
  error: z.string().nullable(),
});
export type AIStatus = z.infer<typeof AIStatusSchema>;

export const summaryApi = {
  get: (jobId: string) => apiRequest(`/jobs/${jobId}/summary`, SummarySchema),
  generate: (jobId: string) => apiRequest(`/jobs/${jobId}/summary`, SummarySchema, { method: "POST" }),
  save: (jobId: string, content: string) =>
    apiRequest(`/jobs/${jobId}/summary`, SummarySchema, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),
  aiStatus: () => apiRequest("/ai/status", AIStatusSchema),
};

export function isSummaryBusy(status: SummaryStatus): boolean {
  return status === "queued" || status === "processing";
}

/** Why AI can't run right now, in words the user can act on — or null if it's ready. */
export function aiProblem(status: AIStatus | undefined): string | null {
  if (!status) return null;
  if (!status.reachable) return "Ollama is not running. Start it with `ollama serve`, then try again.";
  if (!status.model_installed) return `Model ${status.model} is not installed. Run \`ollama pull ${status.model}\`.`;
  return null;
}
