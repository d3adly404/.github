import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "@/components/Header";
import LiveAlertToasts from "@/components/LiveAlertToasts";
import { currentUser } from "@/lib/auth";
import { simulatorStatus } from "@/lib/simulator";
import { notifyConfig } from "@/lib/notifications/config";

export const metadata: Metadata = {
  title: {
    default: "GhanaBed — live hospital bed availability in Ghana",
    template: "%s · GhanaBed",
  },
  description:
    "Real-time inpatient bed availability across Ghana's regions, with SMS, WhatsApp, e-mail and browser alerts that tell patients the moment a bed frees up — or warn them a hospital is full before they travel.",
  applicationName: "GhanaBed",
  keywords: ["Ghana", "hospital beds", "bed availability", "Ghana Health Service", "patient alerts", "occupancy"],
  openGraph: {
    title: "GhanaBed — know before you travel",
    description: "Live hospital bed availability and patient alerting for all 16 regions of Ghana.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#050912",
  width: "device-width",
  initialScale: 1,
};

// Bed counts change constantly — never serve a cached page.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const sim = simulatorStatus();
  const cfg = notifyConfig();

  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-emerald-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-emerald-950"
        >
          Skip to content
        </a>
        <Header
          user={
            user
              ? { name: user.name, role: user.role, username: user.username, facility: user.facility_name ?? null }
              : null
          }
          simulator={sim}
          notifyMode={cfg.mode}
        />
        <main id="main" className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
          {children}
        </main>
        <footer className="border-t border-white/8 bg-ink-950/60">
          <div className="mx-auto w-full max-w-7xl px-4 py-10 text-sm text-slate-400 sm:px-6 lg:px-8">
            <div className="grid gap-8 md:grid-cols-3">
              <div>
                <p className="mb-2 text-base font-bold text-slate-200">GhanaBed</p>
                <p className="leading-relaxed">
                  A ward-to-patient bed availability and alerting layer for Ghana. Facilities report occupancy from the
                  staff portal; patients subscribe and are told immediately when a bed frees up or a hospital runs full.
                </p>
              </div>
              <div>
                <p className="section-title mb-3">How the data works</p>
                <ul className="space-y-1.5 leading-relaxed">
                  <li>• Counts are reported by ward staff and streamed live to every screen.</li>
                  <li>• Reports older than 90 minutes are flagged as stale.</li>
                  <li>
                    • A demo simulator keeps occupancy moving. Switch it off in the portal when a real HIS/GHS feed is
                    connected.
                  </li>
                </ul>
              </div>
              <div>
                <p className="section-title mb-3">Important</p>
                <p className="leading-relaxed">
                  This deployment ships with <strong className="text-slate-300">illustrative</strong> facility data for
                  demonstration and training — it is not an official Ghana Health Service feed. Always call the facility
                  admissions desk before travelling, and in an emergency dial 112.
                </p>
              </div>
            </div>
            <p className="mt-8 border-t border-white/8 pt-5 text-xs text-slate-500">
              GhanaBed · built for the Ghanaian health system · notifications in{" "}
              <span className="text-slate-400">{cfg.mode === "live" ? "LIVE delivery" : "simulator mode"}</span>
            </p>
          </div>
        </footer>
        <LiveAlertToasts />
      </body>
    </html>
  );
}
