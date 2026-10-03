import { Hash, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { errorMessage } from "@/lib/apiClient";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

import JobList from "../components/JobList";
import { useJobList, useTags } from "../hooks/useJobs";
import styles from "./Pages.module.css";

const SEARCH_DEBOUNCE_MS = 300;

function parseTagId(raw: string | null): number | null {
  if (raw == null || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

/** All files; filters come from the URL (?q= from the toolbar search, ?tag= from the sidebar). */
const JobsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tagId = parseTagId(searchParams.get("tag"));
  const query = useDebouncedValue(searchParams.get("q") ?? "", SEARCH_DEBOUNCE_MS).trim();
  const { data: jobs, isLoading, isFetching, error } = useJobList({ tagId, query });
  const { data: tags } = useTags();
  const tag = tags?.find((t) => t.id === tagId);
  const isFiltered = tagId != null || query !== "";

  const clearParam = (key: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className={styles.page}>
      <header className={styles.filesHeader}>
        <h1 className="page-title">{tag ? tag.name : "All files"}</h1>
        <div className={styles.filters}>
          {tag && (
            <span className={styles.filterChip}>
              <Hash size={13} /> {tag.name}
              <button type="button" className="ghost icon" onClick={() => clearParam("tag")} aria-label="Clear tag filter">
                <X size={13} />
              </button>
            </span>
          )}
          {query && (
            <span className={styles.filterChip}>
              “{query}”
              <button type="button" className="ghost icon" onClick={() => clearParam("q")} aria-label="Clear search">
                <X size={13} />
              </button>
            </span>
          )}
          {isFetching && !isLoading && <span className="muted">Searching…</span>}
        </div>
      </header>

      {isLoading && <p className="muted">Loading…</p>}
      {error && <p className="error-text">Could not load files: {errorMessage(error)}</p>}
      {jobs && <JobList jobs={jobs} query={query} isFiltered={isFiltered} />}
    </div>
  );
};

export default JobsPage;
