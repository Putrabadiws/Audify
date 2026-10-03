import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { apiRequest } from "@/lib/apiClient";

export const AppSettingsSchema = z.object({
  vocabulary: z.string(),
  default_language: z.string(),
  whisper_model: z.string(),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

const settingsKey = ["settings"] as const;

export function useAppSettings() {
  return useQuery({ queryKey: settingsKey, queryFn: () => apiRequest("/settings", AppSettingsSchema) });
}

export function useSaveVocabulary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vocabulary: string) =>
      apiRequest("/settings", AppSettingsSchema, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vocabulary }),
      }),
    onSuccess: (data) => qc.setQueryData(settingsKey, data),
  });
}
