import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { isActive, jobsApi } from "../api/jobsApi";
import type { JobDetail, JobFilters, RetranscribeInput, Segment, UploadInput } from "../api/jobsApi";

// Everything under "jobs" (lists, details, tags) is invalidated together via the prefix.
export const jobKeys = {
  all: ["jobs"] as const,
  list: (filters: JobFilters) => ["jobs", "list", filters] as const,
  detail: (id: string) => ["jobs", id] as const,
  tags: ["jobs", "tags"] as const,
};

// Poll while any job is transcribing; stop once everything settles to avoid idle traffic.
const ACTIVE_POLL_MS = 2000;

export function useJobList(filters: JobFilters) {
  return useQuery({
    queryKey: jobKeys.list(filters),
    queryFn: () => jobsApi.list(filters),
    // keep showing the previous results while a new search is in flight (no flicker)
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.some((j) => isActive(j.status)) ? ACTIVE_POLL_MS : false,
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: jobKeys.detail(id),
    queryFn: () => jobsApi.get(id),
    refetchInterval: (query) => (query.state.data && isActive(query.state.data.status) ? ACTIVE_POLL_MS : false),
  });
}

export function useUploadJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadInput) => jobsApi.upload(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: jobKeys.all }),
  });
}

export function useRenameJob(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => jobsApi.rename(id, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: jobKeys.all }),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => jobsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: jobKeys.all }),
  });
}

export function useRetranscribe(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RetranscribeInput) => jobsApi.retranscribe(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: jobKeys.all }),
  });
}

export function useUpdateSegment(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ segmentId, text }: { segmentId: number; text: string }) =>
      jobsApi.updateSegment(jobId, segmentId, text),
    // Patch the cached transcript in place: refetching thousands of segments per edit is wasteful.
    onSuccess: (updated: Segment) => {
      qc.setQueryData<JobDetail>(jobKeys.detail(jobId), (old) =>
        old ? { ...old, segments: old.segments.map((s) => (s.id === updated.id ? updated : s)) } : old,
      );
    },
  });
}

export function useTags() {
  return useQuery({ queryKey: jobKeys.tags, queryFn: jobsApi.tags });
}

export function useSetTags(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tags: string[]) => jobsApi.setTags(jobId, tags),
    onSuccess: (job) => {
      qc.setQueryData<JobDetail>(jobKeys.detail(jobId), (old) => (old ? { ...old, tags: job.tags } : old));
      void qc.invalidateQueries({ queryKey: jobKeys.all });
    },
  });
}
