import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Upload } from "lucide-react";
import { Outlet } from "react-router-dom";

import { errorMessage } from "@/lib/apiClient";
import { useTheme } from "@/lib/theme";
import { readUploadOptions, useUploadFiles } from "@/modules/jobs";
import { SettingsModal } from "@/modules/settings";

import styles from "./AppShell.module.css";
import { ShellContext } from "./shellContext";
import Sidebar from "./Sidebar";
import Toolbar from "./Toolbar";

const SIDEBAR_KEY = "audify-sidebar";

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes("Files");
}

const AppShell = () => {
  const theme = useTheme();
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.localStorage.getItem(SIDEBAR_KEY) !== "closed");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  // dragenter/leave fire for every child element; count them so the overlay doesn't flicker
  const dragDepth = useRef(0);
  const { uploadFiles, isUploading, error, failures } = useUploadFiles();

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_KEY, isSidebarOpen ? "open" : "closed");
  }, [isSidebarOpen]);

  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);
  const shell = useMemo(() => ({ openSettings }), [openSettings]);

  // Drop audio/video anywhere: uses the options last chosen on the Dashboard.
  const dropHandlers = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current += 1;
      setIsDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setIsDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      void uploadFiles(Array.from(e.dataTransfer.files), readUploadOptions());
    },
  };

  return (
    <ShellContext.Provider value={shell}>
      <div className={`${styles.shell} ${isSidebarOpen ? "" : styles.collapsed}`} {...dropHandlers}>
        {isSidebarOpen && <Sidebar />}
        <div className={styles.window}>
          <Toolbar
            isDark={theme.isDark}
            onToggleTheme={theme.toggle}
            onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
            onOpenSettings={openSettings}
          />
          {(isUploading || error || failures.length > 0) && (
            <div className={styles.banner} role="status">
              {isUploading
                ? "Uploading…"
                : `Upload failed${failures.length ? `: ${failures.join(", ")}` : ""}${error ? ` — ${errorMessage(error)}` : ""}`}
            </div>
          )}
          <main className={styles.main}>
            <Outlet />
          </main>
        </div>

        {isDragging && (
          <div className={styles.dropOverlay}>
            <div className={styles.dropCard}>
              <Upload size={28} />
              <strong>Drop to transcribe</strong>
              <span className="muted">Audio or video · uses your Dashboard language & vocabulary</span>
            </div>
          </div>
        )}
        {isSettingsOpen && <SettingsModal onClose={closeSettings} theme={theme.theme} onThemeChange={theme.setTheme} />}
      </div>
    </ShellContext.Provider>
  );
};

export default AppShell;
