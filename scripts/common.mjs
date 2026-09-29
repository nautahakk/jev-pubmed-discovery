// Settings shared by the run scripts. The numbers here are the ones fixed in PROTOCOL.md.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Downloads and Jev's answers go in ./data (ignored by git). Set DATA_DIR to keep them somewhere else.
export const DATA = process.env.DATA_DIR || fileURLToPath(new URL("../data", import.meta.url));
mkdirSync(DATA, { recursive: true });

export const CUTOFF = 1985;            // papers published 1985 or earlier
export const RAYNAUD_TERM = "raynaud disease[mh]";
export const BRIDGE_CAP = 10000;       // papers per bridge, sampled above this
export const SEED = 1986;
export const JEV = { concurrency: 24, rpm: 900 }; // Jev allows 1,200/min; the rest is left for other apps on the same key
export const PRICE_PER_MTOK = 0.042;   // dollars per million input tokens (output is free)

export const file = (name) => join(DATA, name);
export const readJson = (name) => JSON.parse(readFileSync(file(name), "utf8"));
export const writeJson = (name, value) => writeFileSync(file(name), JSON.stringify(value, null, 2));
export const writeLines = (name, rows) => writeFileSync(file(name), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

export function apiKey() {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error("Set TYPESAFE_API_KEY first");
  return key;
}

export function progress(label, done, total, startedAt, extra = "") {
  const secs = (Date.now() - startedAt) / 1000;
  const eta = done ? Math.round(((total - done) * secs) / done / 60) : "?";
  process.stdout.write(`\r  ${label} ${done}/${total}${extra}, ${Math.round(secs)} s, about ${eta} min left   `);
}
