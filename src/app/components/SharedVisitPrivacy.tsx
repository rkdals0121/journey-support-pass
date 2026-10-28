"use client";
import { useEffect } from "react";
export function SharedVisitPrivacy() {
  useEffect(() => {
    try {
      localStorage.removeItem("jsp-support-visits-v1");
    } catch {
      /* Storage can be disabled. */
    }
    try {
      for (const key of Object.keys(sessionStorage))
        if (key.startsWith("jsp-visit-draft-v2"))
          sessionStorage.removeItem(key);
      const state = window.history.state;
      if (state?.jspVisitDraft) {
        const clean = { ...state };
        delete clean.jspVisitDraft;
        window.history.replaceState(clean, "");
      }
    } catch {
      /* The shared view itself never writes a personal draft. */
    }
  }, []);
  return null;
}
