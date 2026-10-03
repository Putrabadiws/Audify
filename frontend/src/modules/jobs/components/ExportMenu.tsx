import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Download } from "lucide-react";

import { EXPORT_FORMATS, jobsApi } from "../api/jobsApi";
import type { ExportFormat } from "../api/jobsApi";
import styles from "./ExportMenu.module.css";

interface ExportMenuProps {
  jobId: string;
  disabled: boolean;
}

const FORMAT_LABELS = {
  txt: { name: "Text", hint: ".txt" },
  srt: { name: "Subtitles", hint: ".srt" },
  vtt: { name: "Web subtitles", hint: ".vtt" },
  md: { name: "Markdown", hint: ".md" },
  json: { name: "JSON", hint: ".json" },
} satisfies Record<ExportFormat, { name: string; hint: string }>;

// SRT/VTT/JSON always carry timings, so the toggle only matters for txt/md.
const TIMESTAMP_OPTIONAL: ReadonlySet<ExportFormat> = new Set(["txt", "md"]);

/** "Export ▾" button with a popover: pick a format, optional timestamps, download. */
const ExportMenu = ({ jobId, disabled }: ExportMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("txt");
  const [timestamps, setTimestamps] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  // close on outside click / Esc, like a native menu
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Node && !rootRef.current?.contains(e.target)) setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  // Navigate a temporary <a download>: the backend sets Content-Disposition, so the browser
  // saves the file with the job title instead of opening it.
  const handleExport = () => {
    const link = document.createElement("a");
    link.href = jobsApi.exportUrl(jobId, format, timestamps);
    link.download = "";
    link.click();
    setIsOpen(false);
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className="primary"
        disabled={disabled}
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <Download size={15} /> Export <ChevronDown size={14} />
      </button>
      {isOpen && (
        <div className={styles.popover} role="dialog" aria-label="Export transcript">
          <p className={styles.heading}>Format</p>
          <div role="radiogroup" aria-label="Export format" className={styles.formats}>
            {EXPORT_FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={f === format}
                className={`ghost ${styles.format} ${f === format ? styles.selected : ""}`}
                onClick={() => setFormat(f)}
              >
                <span>{FORMAT_LABELS[f].name}</span>
                <span className={styles.hint}>{FORMAT_LABELS[f].hint}</span>
                {f === format && <Check size={14} className={styles.check} />}
              </button>
            ))}
          </div>
          {TIMESTAMP_OPTIONAL.has(format) && (
            <label className={styles.toggle}>
              <input type="checkbox" checked={timestamps} onChange={(e) => setTimestamps(e.target.checked)} />
              Include timestamps
            </label>
          )}
          <button type="button" className={`primary ${styles.download}`} onClick={handleExport}>
            Download {FORMAT_LABELS[format].hint}
          </button>
        </div>
      )}
    </div>
  );
};

export default ExportMenu;
