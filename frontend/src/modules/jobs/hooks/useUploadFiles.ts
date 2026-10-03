import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import { LANGUAGE_OPTIONS } from "../constants";
import { useUploadJob } from "./useJobs";

const OPTIONS_KEY = "audify-upload-options";

export interface UploadOptions {
  language: string;
  vocabulary: string;
}

const DEFAULT_OPTIONS: UploadOptions = { language: LANGUAGE_OPTIONS[0].value, vocabulary: "" };

function isUploadOptions(v: unknown): v is UploadOptions {
  return (
    typeof v === "object" &&
    v !== null &&
    "language" in v &&
    "vocabulary" in v &&
    typeof v.language === "string" &&
    LANGUAGE_OPTIONS.some((o) => o.value === v.language) &&
    typeof v.vocabulary === "string"
  );
}

export function readUploadOptions(): UploadOptions {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(OPTIONS_KEY) ?? "null");
    return isUploadOptions(parsed) ? parsed : DEFAULT_OPTIONS;
  } catch {
    return DEFAULT_OPTIONS;
  }
}

/**
 * Language + per-upload vocabulary, remembered across visits. Shared by the Dashboard cards,
 * the recorder and drop-anywhere so all three create jobs with the same settings.
 */
export function useUploadOptions() {
  const [options, setOptionsState] = useState<UploadOptions>(readUploadOptions);
  const setOptions = useCallback((patch: Partial<UploadOptions>) => {
    setOptionsState((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(OPTIONS_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable: options still apply for this session
      }
      return next;
    });
  }, []);
  return { options, setOptions };
}

/** Upload files one by one; a single file opens its editor, several go to the Files list. */
export function useUploadFiles() {
  const upload = useUploadJob();
  const navigate = useNavigate();
  const [failures, setFailures] = useState<string[]>([]);

  const uploadFiles = useCallback(
    async (files: File[], options: UploadOptions) => {
      if (files.length === 0) return;
      setFailures([]);
      const created: string[] = [];
      // sequential: the backend worker is single-threaded anyway, and it keeps errors per file
      for (const file of files) {
        try {
          const job = await upload.mutateAsync({ file, ...options });
          created.push(job.id);
        } catch {
          setFailures((f) => [...f, file.name]);
        }
      }
      if (created.length === 1) navigate(`/jobs/${created[0]}`);
      else if (created.length > 1) navigate("/files");
    },
    [upload, navigate],
  );

  return { uploadFiles, isUploading: upload.isPending, error: upload.error, failures };
}
