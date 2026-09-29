// Hidden-years test runner (BENCHMARK.md). Stops at a spending cap and picks up where it left off.
//   node scripts/bench/run.mjs --max-dollars 3            practice diseases, at most $3 this session
//   node scripts/bench/run.mjs --only exam --max-dollars 3 exam diseases (after practice is scored)
//   node scripts/bench/run.mjs --dry-run                  everything up to the first Jev call, no spending
import { existsSync, mkdirSync } from "node:fs";
import { readJsonl, appendJsonl } from "../../lib/jsonl.mjs";
import { allIds, fetchRecords, sampleIds } from "../../lib/pubmed.mjs";
import { lookupTrees, isBodyProcess } from "../../lib/mesh.mjs";
import { stage1Request, stage2Request } from "../../lib/questions.mjs";
import { stage1Votes, selectBridges } from "../../lib/score.mjs";
import { naturalName } from "../../lib/benchmark.mjs";
import { systemOne } from "../../lib/jev.mjs";
import { runPool } from "../../lib/pool.mjs";
import { PRICE_PER_MTOK } from "../../lib/price.mjs";
import { file, readJson, writeJson, writeLines, JEV, apiKey, progress } from "../common.mjs";
import { caseDir, keepPair, cacheKey } from "./shared.mjs";

const CUTOFF = 1995, CAP = 10000, SEED = 1986, MAX_QUESTIONS = 120;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const maxDollars = Number(value("--max-dollars", "0"));
const dryRun = flag("--dry-run");
const only = value("--only", "practice");
if (!dryRun && !(maxDollars > 0)) throw new Error("Give a spending cap, e.g. --max-dollars 3 (or use --dry-run)");

const bench = readJson("benchmark.json");
const diseases = bench.diseases.filter((d) => bench.split[only]?.includes(d.disease));
const trees = existsSync(file("benchmark-trees.json")) ? readJson("benchmark-trees.json") : {};
const cachePath = file("bench/answers.jsonl");
mkdirSync(file("bench"), { recursive: true });
const cache = new Map(readJsonl(cachePath).map((r) => [r.k, r.p]));
const key = dryRun ? null : apiKey();
let spent = 0;
const overBudget = () => !dryRun && spent >= maxDollars;

async function ask(body) {
  const res = await systemOne({ apiKey: key, body });
  spent += ((res.usage?.input_tokens ?? 0) / 1e6) * PRICE_PER_MTOK;
  return res;
}

async function treesFor(labels) {
  const missing = labels.filter((l) => !(l in trees));
  if (missing.length) {
    const found = await lookupTrees(missing);
    for (const l of missing) trees[l] = found[l] ?? [];
    writeJson("benchmark-trees.json", trees);
  }
}

async function runCase({ disease }) {
  const dir = caseDir(disease);
  mkdirSync(file(dir), { recursive: true });
  const say = (s) => console.log(`[${disease}] ${s}`);

  // Step 1a: the disease's own papers up to the cutoff
  if (!existsSync(file(`${dir}/papers.jsonl`))) {
    const records = await fetchRecords(await allIds(`"${disease}"[mh:noexp]`, 1800, CUTOFF));
    writeLines(`${dir}/papers.jsonl`, records.filter((r) => r.year <= CUTOFF));
  }
  const papers = readJsonl(file(`${dir}/papers.jsonl`));
  await treesFor([...new Set(papers.flatMap((r) => r.mesh.map((m) => m.name)))]);
  const todo1 = papers
    .map((r) => ({ r, ms: [...new Set(r.mesh.map((m) => m.name).filter((n) => isBodyProcess(trees[n])))] }))
    .filter((x) => x.ms.length);

  // Step 1b: Jev reads them
  const s1path = file(`${dir}/stage1.jsonl`);
  const done1 = new Set(readJsonl(s1path).map((r) => r.pmid));
  const pending1 = todo1.filter((x) => !done1.has(x.r.pmid));
  say(`${papers.length} papers up to ${CUTOFF}; step 1 asks ${todo1.length} (${pending1.length} still to go)`);
  if (dryRun) return;
  const t1 = Date.now();
  let n1 = 0;
  await runPool(pending1, async ({ r, ms }) => {
    if (overBudget()) return;
    const { body, ids } = stage1Request(r, ms, naturalName(disease));
    try {
      const res = await ask(body);
      appendJsonl(s1path, { pmid: r.pmid, ids, answers: res.answers, usage: res.usage, model: res.model });
    } catch (err) {
      appendJsonl(file(`${dir}/errors.jsonl`), { step: 1, pmid: r.pmid, error: err.message });
    }
    if (++n1 % 50 === 0) progress("step 1", n1, pending1.length, t1, `, $${spent.toFixed(2)} spent`);
  }, JEV);
  const left1 = todo1.length - new Set(readJsonl(s1path).map((r) => r.pmid)).size;
  if (left1 > 0) return say(overBudget() ? `\nstopped at the $${maxDollars} cap during step 1; run again to continue` : `\n${left1} step 1 papers failed; run again to retry them`);

  const bridges = selectBridges(stage1Votes(readJsonl(s1path)));
  writeJson(`${dir}/bridges.json`, bridges);
  say(`\n${bridges.length} bridges: ${bridges.map((b) => `${b.measure} (${b.direction})`).join(", ")}`);

  // Step 2a: bridge papers up to the cutoff, with their MeSH qualifiers (needed for the reading plan)
  if (!existsSync(file(`${dir}/bridge-papers.jsonl`))) {
    const membership = new Map(), sizes = [];
    for (const b of bridges) {
      const all = await allIds(`"${b.measure}"[mh:noexp]`, 1800, CUTOFF);
      const used = sampleIds(all, CAP, SEED);
      sizes.push({ measure: b.measure, papers: all.length, used: used.length });
      for (const id of used) (membership.get(id) ?? membership.set(id, []).get(id)).push(b.measure);
    }
    writeJson(`${dir}/bridge-sizes.json`, sizes);
    const records = await fetchRecords([...membership.keys()]);
    writeLines(`${dir}/bridge-papers.jsonl`, records.filter((r) => r.year <= CUTOFF).map((r) => ({ ...r, chems: [...new Set(r.chems)], bridges: membership.get(r.pmid) ?? [] })));
  }

  // Step 2b: Jev reads only the substance–measure pairs the reading plan keeps, skipping cached answers
  const work = [];
  for (const p of readJsonl(file(`${dir}/bridge-papers.jsonl`))) {
    const pairs = p.bridges.flatMap((measure) => p.chems.map((substance) => ({ measure, substance })))
      .filter((pair) => keepPair(p, pair) && !cache.has(cacheKey(p.pmid, pair)));
    if (pairs.length) work.push({ p, pairs });
  }
  const questions = work.reduce((n, w) => n + w.pairs.length, 0);
  say(`step 2: ${work.length} papers, ${questions} new questions`);
  const t2 = Date.now();
  let n2 = 0;
  await runPool(work, async ({ p, pairs }) => {
    if (overBudget()) return;
    try {
      for (let i = 0; i < pairs.length; i += MAX_QUESTIONS) {
        const { body, ids } = stage2Request(p, pairs.slice(i, i + MAX_QUESTIONS));
        const res = await ask(body);
        for (const [qid, pair] of Object.entries(ids)) {
          const k = cacheKey(p.pmid, pair);
          const probabilities = res.answers[qid]?.probabilities ?? {};
          cache.set(k, probabilities);
          appendJsonl(cachePath, { k, p: probabilities, model: res.model });
        }
      }
    } catch (err) {
      appendJsonl(file(`${dir}/errors.jsonl`), { step: 2, pmid: p.pmid, error: err.message });
    }
    if (++n2 % 100 === 0) progress("step 2", n2, work.length, t2, `, $${spent.toFixed(2)} spent`);
  }, JEV);
  const left2 = work.reduce((n, w) => n + w.pairs.filter((pair) => !cache.has(cacheKey(w.p.pmid, pair))).length, 0);
  if (left2 > 0) return say(overBudget() ? `\nstopped at the $${maxDollars} cap during step 2; run again to continue` : `\n${left2} step 2 questions failed; run again to retry them`);
  writeJson(`${dir}/done.json`, { finished: new Date().toISOString() });
  say(`\ndone`);
}

for (const d of diseases) {
  if (existsSync(file(`${caseDir(d.disease)}/done.json`))) continue;
  if (overBudget()) break;
  await runCase(d);
}
console.log(`\nspent this session: $${spent.toFixed(2)}${dryRun ? " (dry run)" : ` of a $${maxDollars} cap`}`);
