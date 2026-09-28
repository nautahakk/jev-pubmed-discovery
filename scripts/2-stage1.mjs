// Step 1b: Jev reads each Raynaud paper and says how each body measure on it compares in Raynaud's.
import { existsSync } from "node:fs";
import { readJsonl, appendJsonl } from "../lib/jsonl.mjs";
import { lookupTrees, isBodyProcess } from "../lib/mesh.mjs";
import { stage1Request } from "../lib/questions.mjs";
import { systemOne } from "../lib/jev.mjs";
import { runPool } from "../lib/pool.mjs";
import { stage1Votes, selectBridges } from "../lib/score.mjs";
import { file, readJson, writeJson, JEV, PRICE_PER_MTOK, apiKey, progress } from "./common.mjs";

const records = readJsonl(file("raynaud.jsonl"));
const labels = [...new Set(records.flatMap((r) => r.mesh.map((m) => m.name)))].sort();
if (!existsSync(file("mesh-trees.json"))) writeJson("mesh-trees.json", await lookupTrees(labels));
const trees = readJson("mesh-trees.json");
const measures = labels.filter((l) => isBodyProcess(trees[l]));
const missing = labels.filter((l) => !trees[l]);
writeJson("candidate-measures.json", { measures, missingTreeNumbers: missing });
console.log(`${labels.length} MeSH headings on Raynaud papers, ${measures.length} are body processes (${missing.length} without tree numbers: ${missing.slice(0, 8).join("; ")}${missing.length > 8 ? "…" : ""})`);

const isMeasure = new Set(measures);
const todo = records
  .map((r) => ({ r, ms: [...new Set(r.mesh.map((m) => m.name).filter((n) => isMeasure.has(n)))] }))
  .filter((x) => x.ms.length);
const out = file("stage1.jsonl");
const done = new Set(readJsonl(out).map((row) => row.pmid));
const pending = todo.filter((x) => !done.has(x.r.pmid));
console.log(`${todo.length} papers have a candidate measure; ${pending.length} still to ask`);

const key = apiKey();
const t0 = Date.now();
let n = 0, tokens = 0, errors = 0;
await runPool(pending, async ({ r, ms }) => {
  const { body, ids } = stage1Request(r, ms);
  try {
    const res = await systemOne({ apiKey: key, body });
    appendJsonl(out, { pmid: r.pmid, ids, answers: res.answers, usage: res.usage, model: res.model });
    tokens += res.usage?.input_tokens ?? 0;
  } catch (err) {
    errors++;
    appendJsonl(file("stage1-errors.jsonl"), { pmid: r.pmid, error: err.message });
  }
  n++;
  if (n % 50 === 0 || n === pending.length) progress("asked", n, pending.length, t0, `, ${errors} errors, $${((tokens / 1e6) * PRICE_PER_MTOK).toFixed(3)}`);
}, JEV);
console.log();

const votes = stage1Votes(readJsonl(out));
const bridges = selectBridges(votes);
writeJson("stage1-votes.json", votes);
writeJson("bridges.json", bridges);
console.log(`\n${bridges.length} bridges:`);
for (const b of bridges) {
  console.log(`  ${b.measure}: ${b.direction} in Raynaud's (${b.votes} papers; ${b.opposite} say the opposite, ${b.noDifference} no difference; ${b.papers} asked)`);
}
