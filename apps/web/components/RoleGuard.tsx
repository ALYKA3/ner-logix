"use client";

import { useEffect, useState } from "react";
import { api, signIn } from "@/lib/api";
import type { Role } from "@/lib/types";

export default function RoleGuard({ role, children }: { role: Role; children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function verify() {
      try {
        const user = await api<{role:Role}>("/api/v1/auth/me");
        if (user.role !== role) await signIn(role);
        if (active) setReady(true);
      } catch {
        try {
          await signIn(role);
          if (active) setReady(true);
        } catch (requestError) {
          if (active) setError(requestError instanceof Error ? requestError.message : "Workspace authentication failed");
        }
      }
    }
    verify();
    return () => { active = false; };
  }, [role]);
  if (error) return <div className="loading-screen">{error}</div>;
  return ready ? children : <div className="loading-screen">Verifying workspace access…</div>;
}
