"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ChevronRight, ShieldCheck, Truck, UserRoundSearch } from "lucide-react";
import PwaRegister from "@/components/PwaRegister";
import { signIn } from "@/lib/api";
import type { Role } from "@/lib/types";

const roles = [
  { role: "ADMIN" as Role, title: "Admin / Control Room", description: "Monitor fleet, accessibility, incidents and approve routing decisions.", href: "/admin", icon: Activity },
  { role: "DRIVER" as Role, title: "Driver", description: "Receive approved routes, warnings and emergency support.", href: "/driver", icon: Truck },
  { role: "FIELD_OFFICER" as Role, title: "Field Officer", description: "Report and verify ground-level road and bridge conditions.", href: "/field-officer", icon: UserRoundSearch },
];

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState<Role | null>(null);
  const [error, setError] = useState("");
  async function enter(role: Role, href: string) {
    setLoading(role); setError("");
    try { await signIn(role); router.push(href); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to sign in"); setLoading(null); }
  }
  return (
    <main className="role-shell">
      <PwaRegister />
      <div className="role-glow" />
      <header className="ministry-line"><ShieldCheck size={19} /> MINISTRY OF DEVELOPMENT OF NORTH EASTERN REGION · SIH26002</header>
      <section className="role-hero">
        <div className="hero-copy">
          <p className="eyebrow">ASSAM PILOT · SYSTEM OPERATIONAL</p>
          <h1>NER-LOGIX</h1>
          <p className="hero-subtitle">AI-Based Smart Logistics &amp; Accessibility Intelligence Platform for the North Eastern Region</p>
          <div className="hero-status"><span className="live-dot" /> Real-time intelligence for safer disaster logistics decisions</div>
        </div>
        <div className="role-list">
          {roles.map((item) => {
            const Icon = item.icon;
            return <button className="role-card" key={item.role} onClick={() => enter(item.role, item.href)} disabled={!!loading}>
              <span className="role-icon"><Icon /></span>
              <span className="role-content"><strong>{item.title}</strong><small>{item.description}</small></span>
              <span className="role-action">{loading === item.role ? "CONNECTING" : "ENTER WORKSPACE"}<ChevronRight size={18} /></span>
            </button>;
          })}
          {error && <p className="form-error">{error}</p>}
        </div>
      </section>
    </main>
  );
}
