import { AudioLines, FolderOpen, Hash, LayoutGrid } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import { useTags } from "@/modules/jobs";

import styles from "./AppShell.module.css";

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? `${styles.navItem} ${styles.navActive}` : styles.navItem);

const Sidebar = () => {
  const { data: tags } = useTags();
  const location = useLocation();
  const activeTag = location.pathname === "/files" ? new URLSearchParams(location.search).get("tag") : null;

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.logo}>
          <AudioLines size={16} strokeWidth={2.4} />
        </span>
        Audify
      </div>

      <nav className={styles.nav} aria-label="Main">
        <NavLink to="/" end className={navClass}>
          <LayoutGrid size={16} /> Dashboard
        </NavLink>
        <p className={styles.section}>Transcriptions</p>
        {/* "All files" is only active without a tag filter, so it and the tag rows never both highlight */}
        <NavLink
          to="/files"
          end
          className={({ isActive }) => navClass({ isActive: isActive && activeTag == null })}
        >
          <FolderOpen size={16} /> All files
        </NavLink>

        <p className={styles.section}>Tags</p>
        {tags?.length ? (
          tags.map((tag) => (
            <NavLink
              key={tag.id}
              to={`/files?tag=${tag.id}`}
              className={() => navClass({ isActive: activeTag === String(tag.id) })}
            >
              <Hash size={15} />
              <span className={styles.navLabel}>{tag.name}</span>
              <span className={styles.count}>{tag.job_count}</span>
            </NavLink>
          ))
        ) : (
          <p className={styles.hint}>Add tags from a file's page to group them here.</p>
        )}
      </nav>
    </aside>
  );
};

export default Sidebar;
