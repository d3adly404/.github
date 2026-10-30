/**
 * Next.js instrumentation hook — runs once when the Node server boots.
 * Used to open/seed the database and start the occupancy simulator.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getDb } = await import("./lib/db");
  getDb();

  const { bootSimulator } = await import("./lib/simulator");
  bootSimulator();

  const { notifyConfig } = await import("./lib/notifications/config");
  const cfg = notifyConfig();
  console.log(
    `[GhanaBed] database ready · notifications in ${cfg.mode.toUpperCase()} mode · simulator ${
      process.env.SIMULATOR_ENABLED === "false" ? "disabled" : "enabled"
    }`,
  );
}
