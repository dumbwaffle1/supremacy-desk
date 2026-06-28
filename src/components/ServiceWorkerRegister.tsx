"use client";

import { useEffect } from "react";

/** Registers the service worker once on load (for PWA install + push). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* ignore */
      });
    }
  }, []);
  return null;
}
