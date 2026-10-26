"use client";
import { useEffect } from "react";
import { useViewSettings } from "./viewSettings";
/** Apply the shared per-tab text scale to standalone entry screens. */
export function ViewScale() {
  const view = useViewSettings();
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--scale",
      String(view.scale ?? 1),
    );
    return () => {
      document.documentElement.style.removeProperty("--scale");
    };
  }, [view.scale]);
  return null;
}
