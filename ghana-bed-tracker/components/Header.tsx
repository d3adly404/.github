"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cx, timeAgo } from "@/lib/format";
import { useLive } from "@/lib/live-client";

interface Props {
  user: { name: string; role: string; username: string; facility: string | null } | null;
  simulator: { enabled: boolean; running: boolean; lastTickAt: number | null; ticks: number };
  notifyMode: string;
}

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/hospitals", label: "Find a bed" },
  { href: "/alerts", label: "My alerts" },
  { href: "/national", label: "National oversight" },
  { href: "/portal", label: "Staff portal" },
];

export default function Header({ user, simulator, notifyMode }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const live = useLive();
  const [open, setOpen] = useState(false);
  const [sinceUpdate, setSinceUpdate] = useState("just now");

  useEffect(() => {
    const t = setInterval(() => {
      setSinceUpdate(live.updatedAt ? timeAgo(live.updatedAt) : "waiting…");
    }, 5000);
    return () => clearInterval(t);
  }, [live.updatedAt]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/8 bg-ink-950/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-ink-950 shadow-[0_8px_24px_-10px_rgba(16,185,129,0.9)]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6" strokeLinecap="round" />
              <path d="M3 18h18M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" strokeLinecap="round" />
              <path d="M16 7.5h3M17.5 6v3" strokeLinecap="round" />
            </svg>
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-extrabold tracking-tight text-white">GhanaBed</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Bed availability · Ghana
            </span>
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 lg:flex">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "rounded-lg px-3 py-2 text-[13px] font-semibold transition",
                  active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <div
            className={cx(
              "hidden items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold ring-1 sm:flex",
              live.connected
                ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                : "bg-amber-500/10 text-amber-300 ring-amber-500/30",
            )}
            title={live.connected ? "Streaming live ward updates" : "Live feed reconnecting"}
          >
            <span className={cx("h-1.5 w-1.5 rounded-full", live.connected ? "bg-emerald-400 live-dot" : "bg-amber-400")} />
            {live.connected ? `LIVE · updated ${sinceUpdate}` : "RECONNECTING"}
          </div>

          {simulator.enabled && (
            <span
              className="hidden rounded-full bg-sky-500/10 px-3 py-1.5 text-[11px] font-semibold text-sky-300 ring-1 ring-sky-500/25 xl:inline-flex"
              title="Demo occupancy simulator is running. Disable it in the staff portal when a real feed is connected."
            >
              SIM {simulator.ticks} ticks
            </span>
          )}

          {user ? (
            <div className="hidden items-center gap-2 md:flex">
              <div className="text-right leading-tight">
                <p className="text-[12px] font-semibold text-slate-200">{user.name}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  {user.role.replace("_", " ")}
                  {user.facility ? ` · ${user.facility}` : ""}
                </p>
              </div>
              <button onClick={logout} className="btn-ghost btn-sm">
                Sign out
              </button>
            </div>
          ) : (
            <Link href="/login" className="btn-ghost btn-sm hidden md:inline-flex">
              Staff sign in
            </Link>
          )}

          <button
            className="btn-ghost btn-sm lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Toggle navigation"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/8 bg-ink-900/95 px-4 py-3 lg:hidden">
          <nav className="grid gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cx(
                  "rounded-lg px-3 py-2.5 text-sm font-semibold",
                  pathname.startsWith(item.href) ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5",
                )}
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-white/8 px-3 pt-3 text-xs text-slate-400">
              <span>{user ? `${user.name} · ${user.role.replace("_", " ")}` : "Not signed in"}</span>
              {user ? (
                <button onClick={logout} className="link">
                  Sign out
                </button>
              ) : (
                <Link href="/login" className="link" onClick={() => setOpen(false)}>
                  Staff sign in
                </Link>
              )}
            </div>
            <p className="px-3 pt-2 text-[10px] uppercase tracking-wider text-slate-600">
              {live.connected ? "Live feed connected" : "Live feed reconnecting"} · notifications in {notifyMode} mode
            </p>
          </nav>
        </div>
      )}
    </header>
  );
}
