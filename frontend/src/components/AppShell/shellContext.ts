import { createContext, useContext } from "react";

export interface ShellContextValue {
  openSettings: () => void;
}

export const ShellContext = createContext<ShellContextValue>({ openSettings: () => undefined });

/** Actions owned by the app frame (e.g. the Settings modal) that pages can trigger. */
export function useShell(): ShellContextValue {
  return useContext(ShellContext);
}
