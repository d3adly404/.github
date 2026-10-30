import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import OutboxView from "@/components/OutboxView";
import { currentUser } from "@/lib/auth";
import { listNotifications } from "@/lib/queries";
import { notifyConfig, providerStatus } from "@/lib/notifications/config";

export const metadata: Metadata = { title: "Notification outbox" };
export const dynamic = "force-dynamic";

export default async function OutboxPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const cfg = notifyConfig();
  const providers = providerStatus();
  const initial = listNotifications(80);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-title">Staff portal</p>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">Notification outbox</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            Every message GhanaBed has produced, with the channel it went out on, the provider that would carry it, and
            the exact payload. Use it to verify alert wording, check delivery status and audit what patients were told.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/portal" className="btn-ghost btn-sm">
            ← Back to console
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {providers.map((p) => (
          <div key={p.channel} className="card card-pad">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12.5px] font-bold text-slate-100">{p.channel}</p>
              <span
                className={
                  p.ready
                    ? "pill bg-emerald-500/10 text-emerald-300 ring-emerald-500/25"
                    : "pill bg-white/5 text-slate-400 ring-white/10"
                }
              >
                <span className={p.ready ? "h-1.5 w-1.5 rounded-full bg-emerald-400" : "h-1.5 w-1.5 rounded-full bg-slate-500"} />
                {p.ready ? "Ready" : "Simulated"}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] font-semibold text-slate-400">{p.provider}</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-slate-500">{p.detail}</p>
          </div>
        ))}
      </section>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[12px] text-slate-400">
        Delivery mode:{" "}
        <strong className={cfg.mode === "live" ? "text-emerald-300" : "text-sky-300"}>
          {cfg.mode === "live" ? "LIVE" : "SIMULATOR"}
        </strong>
        {cfg.mode === "live"
          ? " — messages are dispatched to the configured providers; failures are recorded with the provider error."
          : " — set NOTIFY_MODE=live in .env.local plus provider credentials to deliver for real. Nothing leaves this server while simulating."}
      </div>

      <OutboxView initial={initial} mode={cfg.mode} />
    </div>
  );
}
