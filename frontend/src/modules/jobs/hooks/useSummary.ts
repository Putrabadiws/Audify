import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { isSummaryBusy, summaryApi } from "../api/summaryApi";
import type { Summary } from "../api/summaryApi";

const summaryKey = (jobId: string) => ["summary", jobId] as const;
export const aiStatusKey = ["ai-status"] as const;

// LLM runs take minutes; 3 s polling is plenty and keeps request noise down.
const BUSY_POLL_MS = 3000;

export function useSummary(jobId: string) {
  return useQuery({
    queryKey: summaryKey(jobId),
    queryFn: () => summaryApi.get(jobId),
    refetchInterval: (query) => (query.state.data && isSummaryBusy(query.state.data.status) ? BUSY_POLL_MS : false),
  });
}

export function useGenerateSummary(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => summaryApi.generate(jobId),
    onSuccess: (summary: Summary) => qc.setQueryData(summaryKey(jobId), summary),
  });
}

export function useSaveSummary(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => summaryApi.save(jobId, content),
    onSuccess: (summary: Summary) => qc.setQueryData(summaryKey(jobId), summary),
  });
}

export function useAIStatus() {
  return useQuery({ queryKey: aiStatusKey, queryFn: summaryApi.aiStatus, staleTime: 30_000 });
}
