import { z } from "zod";

import { API_BASE, apiRequest } from "@/lib/apiClient";

export const JobStatusSchema = z.enum(["queued", "processing", "done", "failed"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const SegmentSchema = z.object({
  id: z.number(),
  idx: z.number(),
  start: z.number(),
  end: z.number(),
  text: z.string(),
});
export type Segment = z.infer<typeof SegmentSchema>;

export const TagSchema = z.object({ id: z.number(), name: z.string() });
export type Tag = z.infer<typeof TagSchema>;

export const TagWithCountSchema = TagSchema.extend({ job_count: z.number() });
export type TagWithCount = z.infer<typeof TagWithCountSchema>;

export const SearchMatchSchema = z.object({ segment_id: z.number(), start: z.number(), text: z.string() });
export type SearchMatch = z.infer<typeof SearchMatchSchema>;

export const JobSchema = z.object({
  id: z.string(),
  title: z.string(),
  original_filename: z.string(),
  status: JobStatusSchema,
  progress: z.number(),
  error: z.string().nullable(),
  // requested language; null = auto-detect
  language: z.string().nullable(),
  detected_language: z.string().nullable(),
  vocabulary: z.string(),
  model: z.string().nullable(),
  duration: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  tags: z.array(TagSchema),
});
export type Job = z.infer<typeof JobSchema>;

// List endpoint rows: `matches` holds transcript hits for the active search (empty otherwise).
export const JobListItemSchema = JobSchema.extend({ matches: z.array(SearchMatchSchema) });
export type JobListItem = z.infer<typeof JobListItemSchema>;

export interface JobFilters {
  tagId: number | null;
  query: string;
}

export const JobDetailSchema = JobSchema.extend({
  segments: z.array(SegmentSchema),
  // original upload has real picture frames → editor previews it from videoUrl()
  has_video: z.boolean().default(false),
});
export type JobDetail = z.infer<typeof JobDetailSchema>;

export const EXPORT_FORMATS = ["txt", "srt", "vtt", "md", "json"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface UploadInput {
  file: File;
  language: string;
  vocabulary: string;
}

export interface RetranscribeInput {
  language?: string;
  vocabulary?: string;
}

const jsonHeaders = { "Content-Type": "application/json" };

export const jobsApi = {
  list: ({ tagId, query }: JobFilters) => {
    const params = new URLSearchParams();
    if (tagId != null) params.set("tag", String(tagId));
    if (query.trim()) params.set("q", query.trim());
    const qs = params.toString();
    return apiRequest(`/jobs${qs ? `?${qs}` : ""}`, z.array(JobListItemSchema));
  },

  tags: () => apiRequest("/tags", z.array(TagWithCountSchema)),

  setTags: (id: string, tags: string[]) =>
    apiRequest(`/jobs/${id}/tags`, JobSchema, {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify({ tags }),
    }),

  get: (id: string) => apiRequest(`/jobs/${id}`, JobDetailSchema),

  upload: ({ file, language, vocabulary }: UploadInput) => {
    const form = new FormData();
    form.append("file", file);
    form.append("language", language);
    form.append("vocabulary", vocabulary);
    return apiRequest("/jobs", JobSchema, { method: "POST", body: form });
  },

  rename: (id: string, title: string) =>
    apiRequest(`/jobs/${id}`, JobSchema, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ title }),
    }),

  remove: (id: string) => apiRequest(`/jobs/${id}`, z.null(), { method: "DELETE" }),

  retranscribe: (id: string, input: RetranscribeInput) =>
    apiRequest(`/jobs/${id}/transcribe`, JobSchema, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input),
    }),

  updateSegment: (jobId: string, segmentId: number, text: string) =>
    apiRequest(`/jobs/${jobId}/segments/${segmentId}`, SegmentSchema, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ text }),
    }),

  mediaUrl: (id: string) => `${API_BASE}/jobs/${id}/media`,

  videoUrl: (id: string) => `${API_BASE}/jobs/${id}/video`,

  exportUrl: (id: string, format: ExportFormat, timestamps: boolean) =>
    `${API_BASE}/jobs/${id}/export?format=${format}&timestamps=${timestamps}`,
};

export function isActive(status: JobStatus): boolean {
  return status === "queued" || status === "processing";
}
