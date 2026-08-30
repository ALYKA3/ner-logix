"use client";

import { useEffect } from "react";
import { flushQueue } from "@/lib/offline";

export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js");
    }
    const sync = () => flushQueue().catch(() => undefined);
    window.addEventListener("online", sync);
    if (navigator.onLine) sync();
    return () => window.removeEventListener("online", sync);
  }, []);
  return null;
}
