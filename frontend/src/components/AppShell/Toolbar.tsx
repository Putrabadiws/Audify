import { Moon, PanelLeft, Search, Settings, Sun } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import styles from "./AppShell.module.css";

interface ToolbarProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
}

/**
 * Global search lives here: typing on any page jumps to /files?q=…;
 * the Files page owns debouncing and fetching, the URL is the single source of truth.
 */
const Toolbar = ({ isDark, onToggleTheme, onToggleSidebar, onOpenSettings }: ToolbarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const onFiles = location.pathname === "/files";
  // derived from the URL (no local copy) so sidebar/tag navigation can never leave it stale
  const value = onFiles ? (searchParams.get("q") ?? "") : "";

  const handleSearch = (next: string) => {
    const params = new URLSearchParams(onFiles ? searchParams : undefined);
    if (next.trim()) params.set("q", next);
    else params.delete("q");
    const qs = params.toString();
    navigate(`/files${qs ? `?${qs}` : ""}`, { replace: onFiles });
  };

  return (
    <header className={styles.toolbar}>
      <button type="button" className="ghost icon" onClick={onToggleSidebar} aria-label="Toggle sidebar">
        <PanelLeft size={18} />
      </button>
      <div className={styles.toolbarSpacer} />
      <div className={styles.pillGroup}>
        <button
          type="button"
          className="ghost icon"
          onClick={onToggleTheme}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Light mode" : "Dark mode"}
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button type="button" className="ghost icon" onClick={onOpenSettings} aria-label="Settings" title="Settings">
          <Settings size={17} />
        </button>
      </div>
      <label className={styles.search}>
        <Search size={15} className="muted" />
        <input
          type="search"
          value={value}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search transcripts…"
          maxLength={200}
          aria-label="Search"
        />
      </label>
    </header>
  );
};

export default Toolbar;
