"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const DEMO_ACCOUNTS = [
  { username: "moh.national", label: "National oversight (MoH / GHS)", goes: "/national" },
  { username: "korlebu.admin", label: "Facility admin — Korle Bu", goes: "/portal" },
  { username: "korlebu.ward", label: "Ward staff — Korle Bu", goes: "/portal" },
  { username: "kath.admin", label: "Facility admin — Komfo Anokye", goes: "/portal" },
  { username: "tamale.ward", label: "Ward staff — Tamale Teaching", goes: "/portal" },
];

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent, u = username, p = password) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Sign in failed");

      const next = u.toLowerCase() === "moh.national" ? "/national" : "/portal";
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_0.85fr]">
      <form onSubmit={submit} className="card card-pad">
        <p className="section-title">Staff sign in</p>
        <h2 className="mt-1.5 text-xl font-extrabold tracking-tight text-white">Report bed occupancy</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Ward staff and facility administrators use this portal to record admissions, discharges and capacity changes.
          Every update is streamed to patients instantly and evaluated against their alert rules.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="label" htmlFor="username">Username</label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="korlebu.ward"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs font-semibold text-rose-200">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>

      <div className="card card-pad">
        <p className="section-title mb-3">Demo accounts</p>
        <p className="mb-4 text-xs leading-relaxed text-slate-400">
          Every demo account uses the password{" "}
          <code className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300">BedTrack2026!</code>.
          Tap one to fill the form.
        </p>
        <ul className="space-y-1.5">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.username}>
              <button
                type="button"
                onClick={(e) => {
                  setUsername(a.username);
                  setPassword("BedTrack2026!");
                  void submit(e as unknown as React.FormEvent, a.username, "BedTrack2026!");
                }}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition hover:border-emerald-400/40 hover:bg-emerald-500/10"
              >
                <span className="block font-mono text-[12px] font-semibold text-emerald-300">{a.username}</span>
                <span className="mt-0.5 block text-[11px] text-slate-400">{a.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-white/8 pt-3 text-[11px] leading-relaxed text-slate-500">
          In production these accounts are provisioned from the facility registry with role-based access: ward staff
          report counts, facility administrators manage capacity and broadcasts, national users see everything.
        </p>
      </div>
    </div>
  );
}
