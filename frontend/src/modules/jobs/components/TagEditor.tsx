import { useId, useState } from "react";
import type { KeyboardEvent } from "react";

import { errorMessage } from "@/lib/apiClient";

import type { Tag } from "../api/jobsApi";
import { useSetTags, useTags } from "../hooks/useJobs";
import styles from "./Tags.module.css";

interface TagEditorProps {
  jobId: string;
  tags: Tag[];
}

const MAX_TAG_LENGTH = 50;

/** Chips with ×, plus an input: Enter or comma adds, Backspace on empty removes the last. */
const TagEditor = ({ jobId, tags }: TagEditorProps) => {
  const [draft, setDraft] = useState("");
  const setTags = useSetTags(jobId);
  const { data: allTags } = useTags();
  const listId = useId();
  const names = tags.map((t) => t.name);

  const save = (next: string[]) => setTags.mutate(next);

  const add = () => {
    const name = draft.trim().replace(/,+$/, "").trim();
    setDraft("");
    if (!name || names.some((n) => n.toLowerCase() === name.toLowerCase())) return;
    save([...names, name]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && draft === "" && names.length > 0) {
      save(names.slice(0, -1));
    }
  };

  return (
    <div className={styles.editor}>
      {tags.map((tag) => (
        <span key={tag.id} className={styles.chip}>
          {tag.name}
          <button
            type="button"
            className={styles.remove}
            onClick={() => save(names.filter((n) => n !== tag.name))}
            aria-label={`Remove tag ${tag.name}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className={styles.input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => draft.trim() && add()}
        placeholder={tags.length ? "Add tag" : "+ Add tag"}
        maxLength={MAX_TAG_LENGTH}
        list={listId}
        aria-label="Add tag"
      />
      {/* suggest existing tags so people reuse "Meeting" instead of inventing "meetings" */}
      <datalist id={listId}>
        {allTags
          ?.filter((t) => !names.includes(t.name))
          .map((t) => (
            <option key={t.id} value={t.name} />
          ))}
      </datalist>
      {setTags.isError && <span className="error-text">{errorMessage(setTags.error)}</span>}
    </div>
  );
};

export default TagEditor;
