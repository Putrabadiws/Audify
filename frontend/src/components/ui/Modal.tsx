import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

import styles from "./ui.module.css";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

/** Centered sheet over a blurred backdrop; Esc or backdrop click closes, focus moves inside. */
const Modal = ({ title, onClose, children, wide = false }: ModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className={`${styles.modal} ${wide ? styles.wide : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <button type="button" className={`ghost icon ${styles.close}`} onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  );
};

export default Modal;
