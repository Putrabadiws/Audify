import { useState } from "react";
import type { ReactNode } from "react";
import { AudioLines, Settings as SettingsIcon, Sparkles } from "lucide-react";

import Modal from "@/components/ui/Modal";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { errorMessage } from "@/lib/apiClient";
import type { Theme } from "@/lib/theme";
import { aiProblem, useAIStatus } from "@/modules/jobs";

import { useAppSettings, useSaveVocabulary } from "../api/settingsApi";
import styles from "./SettingsModal.module.css";

type SectionId = "general" | "transcription" | "ai";

const SECTIONS: readonly { id: SectionId; label: string; icon: ReactNode }[] = [
  { id: "general", label: "General", icon: <SettingsIcon size={16} /> },
  { id: "transcription", label: "Transcription", icon: <AudioLines size={16} /> },
  { id: "ai", label: "AI Summary", icon: <Sparkles size={16} /> },
];

const THEME_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies readonly { value: Theme; label: string }[];

interface SettingsModalProps {
  onClose: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  initialSection?: SectionId;
}

const SettingsModal = ({ onClose, theme, onThemeChange, initialSection = "general" }: SettingsModalProps) => {
  const [section, setSection] = useState<SectionId>(initialSection);
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <Modal title="Settings" onClose={onClose} wide>
      <nav className={styles.nav} aria-label="Settings sections">
        <p className={styles.navTitle}>Settings</p>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={s.id === section ? `${styles.navItem} ${styles.navActive}` : styles.navItem}
            aria-current={s.id === section ? "page" : undefined}
            onClick={() => setSection(s.id)}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </nav>
      <div className={styles.content}>
        <h2 className={styles.title}>{current.label}</h2>
        {section === "general" && (
          <Row title="Appearance" description="Auto follows your macOS light/dark setting.">
            <SegmentedControl label="Appearance" options={THEME_OPTIONS} value={theme} onChange={onThemeChange} />
          </Row>
        )}
        {section === "transcription" && <TranscriptionSection />}
        {section === "ai" && <AISection />}
      </div>
    </Modal>
  );
};

/** Title + description on the left, control on the right (settings row). */
const Row = ({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) => (
  <div className={styles.row}>
    <div className={styles.rowText}>
      <strong>{title}</strong>
      {description && <span className="muted">{description}</span>}
    </div>
    {children && <div className={styles.rowControl}>{children}</div>}
  </div>
);

const TranscriptionSection = () => {
  const { data, isLoading, error } = useAppSettings();
  if (isLoading) return <p className="muted">Loading…</p>;
  if (error || !data) return <p className="error-text">{errorMessage(error)}</p>;

  return (
    <>
      {/* keyed on the saved value: the form re-seeds its draft from the server, no sync effect */}
      <VocabularyForm key={data.vocabulary} saved={data.vocabulary} />
      <Row
        title="Engine"
        description={
          <>
            Model <strong>{data.whisper_model}</strong> · default language <strong>{data.default_language}</strong>.
            Change via <code>AUDIFY_WHISPER_MODEL</code> / <code>AUDIFY_DEFAULT_LANGUAGE</code> in{" "}
            <code>backend/.env</code>.
          </>
        }
      />
    </>
  );
};

const VocabularyForm = ({ saved }: { saved: string }) => {
  const save = useSaveVocabulary();
  const [vocabulary, setVocabulary] = useState(saved);
  const isDirty = vocabulary !== saved;

  return (
    <div className={styles.block}>
      <Row
        title="Global vocabulary"
        description={
          <>
            Names, brands and jargon added to every transcription (before the per-file vocabulary). Keeps terms like
            "Chitato" or "hak cipta" from being mis-heard. Separate with commas.
          </>
        }
      />
      <textarea
        className={styles.textarea}
        value={vocabulary}
        onChange={(e) => setVocabulary(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="Chitato, Indofood, TikTok, engagement rate, CPA"
        aria-label="Global vocabulary"
      />
      <div className={styles.actions}>
        <button type="button" className="primary" disabled={!isDirty || save.isPending} onClick={() => save.mutate(vocabulary)}>
          {save.isPending ? "Saving…" : "Save"}
        </button>
        {save.isError && <span className="error-text">{errorMessage(save.error)}</span>}
      </div>
    </div>
  );
};

const AISection = () => {
  const { data: status, isLoading, refetch, isFetching } = useAIStatus();
  const problem = aiProblem(status);

  return (
    <>
      <Row
        title="Status"
        description={
          isLoading ? (
            "Checking Ollama…"
          ) : problem ? (
            <span className="error-text">{problem}</span>
          ) : status ? (
            <span>
              <span className={styles.dot} /> Ready · model <strong>{status.model}</strong>
            </span>
          ) : null
        }
      >
        <button type="button" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? "Checking…" : "Check again"}
        </button>
      </Row>
      <Row
        title="Privacy"
        description="Summaries run on this computer with Ollama — free, and transcripts never leave the machine."
      />
      <Row
        title="Model"
        description={
          <>
            Change via <code>AUDIFY_LLM_MODEL</code> in <code>backend/.env</code> (install it first with{" "}
            <code>ollama pull</code>).
          </>
        }
      />
    </>
  );
};

export default SettingsModal;
