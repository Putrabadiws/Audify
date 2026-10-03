export interface LanguageOption {
  value: string;
  label: string;
}

// "id" first: spike showed forcing Indonesian keeps English phrases intact on ID+EN
// code-switching, is as accurate as auto-detect and slightly faster (4–28%, no detection pass).
export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { value: "id", label: "Indonesian (+ mixed English)" },
  { value: "en", label: "English" },
  { value: "auto", label: "Auto-detect" },
];

export const ACCEPTED_MEDIA = "audio/*,video/*,.m4a,.mp3,.wav,.ogg,.opus,.flac,.webm,.mp4,.mov,.mkv";

export function languageLabel(code: string | null): string {
  if (code == null) return "Auto";
  return LANGUAGE_OPTIONS.find((o) => o.value === code)?.label.split(" ")[0] ?? code;
}
