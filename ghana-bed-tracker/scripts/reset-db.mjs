/**
 * Deletes the local SQLite database so the next boot re-seeds from scratch.
 * Usage: npm run db:reset
 */
import fs from "node:fs";
import path from "node:path";

const file = process.env.DB_PATH ?? "./data/bedtracker.sqlite";
const target = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
const siblings = [target, `${target}-wal`, `${target}-shm`, `${target}-journal`];

let removed = 0;
for (const f of siblings) {
  if (fs.existsSync(f)) {
    fs.rmSync(f, { force: true });
    removed += 1;
    console.log(`removed ${path.relative(process.cwd(), f)}`);
  }
}

if (removed === 0) {
  console.log(`nothing to remove — ${path.relative(process.cwd(), target)} does not exist yet`);
} else {
  console.log("\nDatabase cleared. Start the app again and it will re-seed automatically.");
}
