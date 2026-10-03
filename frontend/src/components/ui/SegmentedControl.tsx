import styles from "./ui.module.css";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

/** macOS-style segmented control (radio group semantics for a11y). */
const SegmentedControl = <T extends string>({ options, value, onChange, label }: SegmentedControlProps<T>) => (
  <div className={styles.segmented} role="radiogroup" aria-label={label}>
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        role="radio"
        aria-checked={o.value === value}
        className={o.value === value ? styles.segmentActive : styles.segment}
        onClick={() => onChange(o.value)}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export default SegmentedControl;
