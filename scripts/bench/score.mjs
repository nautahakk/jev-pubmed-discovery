// Scores the hidden-years test (BENCHMARK.md). Plain code on saved answers, no Jev calls.
//   node scripts/bench/score.mjs          every rule on the practice diseases (+ the fish-oil run, shown apart)
//   node scripts/bench/score.mjs --exam   the chosen rule and R0 on the exam diseases, once practice is done
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readJsonl } from "../../lib/jsonl.mjs";
import { linkEvidence, knownChecker, isFishOil } from "../../lib/score.mjs";
import { classifySubstance, overlapWeights, specificityWeights, rankWeighted } from "../../lib/rules.mjs";
import { lookupTrees, lookupDrugActions } from "../../lib/mesh.mjs";
import { count } from "../../lib/pubmed.mjs";
import { hitMetrics } from "../../lib/benchmark.mjs";
import { file, readJson, writeJson } from "../common.mjs";
import { caseDir, keepPair, cacheKey } from "./shared.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RULES = ["R0", "R1", "R1s", "R2", "R3"]; // simplest first: ties go to the earlier one
const exam = process.argv.includes("--exam");
const cached = (name, fallback) => (existsSync(file(name)) ? readJson(name) : fallback);
mkdirSync(file("bench"), { recursive: true });

// MeSH lookups, cached so repeat scoring is instant
const trees = cached("bench/substance-trees.json", {});
const actions = cached("bench/drug-actions.json", { checked: [], withAction: [] });
async function prepareLookups(names) {
  const missing = names.filter((n) => !(n in trees));
  if (missing.length) {
    const found = await lookupTrees(missing);
    for (const n of missing) trees[n] = found[n] ?? [];
    writeJson("bench/substance-trees.json", trees);
  }
  const checked = new Set(actions.checked);
  const unchecked = names.filter((n) => !checked.has(n));
  if (unchecked.length) {
    const found = await lookupDrugActions(unchecked);
    actions.checked.push(...unchecked);
    actions.withAction.push(...unchecked.filter((n) => found.has(n)));
    writeJson("bench/drug-actions.json", actions);
  }
}
const totals = cached("bench/pubmed-totals.json", {});
async function pubmedTotal(cutoff) {
  if (!totals[cutoff]) { totals[cutoff] = await count(`1800:${cutoff}[dp]`); writeJson("bench/pubmed-totals.json", totals); }
  return totals[cutoff];
}

function loadBenchCase(disease, answers) {
  const dir = caseDir(disease);
  const cache = new Map(readJsonl(file("bench/answers.jsonl")).map((r) => [r.k, r.p]));
  const rows = [];
  for (const p of readJsonl(file(`${dir}/bridge-papers.jsonl`))) {
    const ids = {}, ans = {};
    let i = 0;
    for (const measure of p.bridges) for (const substance of p.chems) {
      const pair = { measure, substance };
      const k = cacheKey(p.pmid, pair);
      if (!keepPair(p, pair) || !cache.has(k)) continue;
      ids[`q${i}`] = pair;
      ans[`q${i++}`] = { probabilities: cache.get(k) };
    }
    if (i) rows.push({ pmid: p.pmid, ids, answers: ans });
  }
  return {
    name: disease, cutoff: 1995, answers: answers.map((a) => a.substance), rows,
    bridges: readJson(`${dir}/bridges.json`), sizes: readJson(`${dir}/bridge-sizes.json`),
    isKnown: knownChecker(readJsonl(file(`${dir}/papers.jsonl`))),
  };
}

function loadFishOilCase() {
  const rows = readJsonl(file("stage2.jsonl"));
  const names = new Set(rows.flatMap((r) => Object.values(r.ids).map((x) => x.substance)));
  return {
    name: "Raynaud's → fish oil (1985, read everything)", cutoff: 1985, answers: [...names].filter(isFishOil), rows,
    bridges: readJson("bridges.json"), sizes: readJson("bridge-sizes.json"),
    isKnown: knownChecker(readJsonl(file("raynaud.jsonl"))),
  };
}

async function scoreCase(c) {
  const evidence = linkEvidence(c.rows, c.bridges);
  // Counting baseline: every question asked counts as support, whatever Jev said
  const counting = {};
  for (const r of c.rows) for (const { measure, substance } of Object.values(r.ids)) {
    ((counting[substance] ??= {})[measure] ??= { support: [], against: [] }).support.push(r.pmid);
  }
  const bridgeNames = c.bridges.map((b) => b.measure);
  await prepareLookups([...new Set([...Object.keys(evidence), ...Object.keys(counting), ...bridgeNames])]);
  const withAction = new Set(actions.withAction);
  const classOf = (s) => classifySubstance(trees[s]);
  const strictOf = (s) => (classOf(s) === "candidate" && !withAction.has(s) ? "no recorded action" : classOf(s));
  const flat = Object.fromEntries(bridgeNames.map((b) => [b, 1]));
  const settings = {
    R0: { weights: flat, classOf: () => "candidate" },
    R1: { weights: flat, classOf },
    R1s: { weights: flat, classOf: strictOf },
    R2: { weights: overlapWeights(bridgeNames, trees), classOf },
    R3: { weights: specificityWeights(Object.fromEntries(c.sizes.map((s) => [s.measure, s.papers])), await pubmedTotal(c.cutoff)), classOf },
  };
  const out = {};
  for (const rule of RULES) {
    const jev = rankWeighted(evidence, { ...settings[rule], isKnown: c.isKnown });
    const base = rankWeighted(counting, { ...settings[rule], isKnown: c.isKnown });
    out[rule] = { jev: hitMetrics(jev.ranked, c.answers), counting: hitMetrics(base.ranked, c.answers), candidates: jev.ranked.length };
  }
  return out;
}

const pct = (x) => `${Math.round(x * 100)}%`;
const best = (m) => Math.min(...Object.values(m.ranks).filter((r) => r !== null)) || "–";
function printCase(name, scored, rules = RULES) {
  console.log(`\n${name}`);
  for (const rule of rules) {
    const { jev, counting, candidates } = scored[rule];
    console.log(`  ${rule.padEnd(4)} top-10 hit ${jev.anyInTop10 ? "yes" : "no "} (chance ${pct(jev.chanceTop10)}) · answers in top 50 ${pct(jev.shareInTop50)} (chance ${pct(jev.chanceTop50)}) · best answer #${best(jev)} of ${candidates} · counting only: best #${best(counting)}, top-50 ${pct(counting.shareInTop50)}`);
  }
}

const bench = cached("benchmark.json", null);
const done = (d) => existsSync(file(`${caseDir(d)}/done.json`));
const answersOf = (d) => bench.diseases.find((x) => x.disease === d).answers;

if (!exam) {
  printCase("Extra practice, doesn't count toward the choice: " + loadFishOilCase().name, await scoreCase(loadFishOilCase()));
  const practice = bench?.split.practice ?? [];
  const scored = [];
  for (const d of practice.filter(done)) {
    const s = await scoreCase(loadBenchCase(d, answersOf(d)));
    printCase(d, s);
    scored.push(s);
  }
  console.log(`\npractice diseases finished: ${scored.length} of ${practice.length}`);
  if (scored.length && scored.length === practice.length) {
    const summary = RULES.map((rule) => ({
      rule,
      main: scored.filter((s) => s[rule].jev.anyInTop10).length / scored.length,
      second: scored.reduce((n, s) => n + s[rule].jev.shareInTop50, 0) / scored.length,
    }));
    const winner = [...summary].sort((a, b) => b.main - a.main || b.second - a.second || RULES.indexOf(a.rule) - RULES.indexOf(b.rule))[0];
    for (const s of summary) console.log(`  ${s.rule}: top-10 hit in ${pct(s.main)} of diseases, ${pct(s.second)} of answers in the top 50`);
    if (!existsSync(file("bench/chosen-rule.json"))) writeJson("bench/chosen-rule.json", { ...winner, chosenAt: new Date().toISOString(), summary });
    console.log(`chosen rule: ${readJson("bench/chosen-rule.json").rule} (locked; the exam can run now)`);
  }
} else {
  if (!existsSync(file("bench/chosen-rule.json"))) throw new Error("Finish and score the practice diseases first");
  const { rule } = readJson("bench/chosen-rule.json");
  const lines = [`# Hidden-years test: exam result`, "", `Rule chosen on the practice diseases: **${rule}** (compared with R0, the fish-oil run's rule).`, ""];
  let hits = 0, hitsR0 = 0;
  const examCases = bench.split.exam.filter(done);
  for (const d of examCases) {
    const s = await scoreCase(loadBenchCase(d, answersOf(d)));
    printCase(d, s, [rule, "R0"]);
    hits += s[rule].jev.anyInTop10 ? 1 : 0;
    hitsR0 += s.R0.jev.anyInTop10 ? 1 : 0;
    lines.push(`- **${d}**: ${rule} top-10 hit ${s[rule].jev.anyInTop10 ? "yes" : "no"} (chance ${pct(s[rule].jev.chanceTop10)}), ${pct(s[rule].jev.shareInTop50)} of answers in the top 50; R0 ${s.R0.jev.anyInTop10 ? "yes" : "no"}, ${pct(s.R0.jev.shareInTop50)}; counting only ${pct(s[rule].counting.shareInTop50)}`);
  }
  lines.push("", `**Headline:** a top-10 hit in ${hits} of ${examCases.length} exam diseases with ${rule} (R0: ${hitsR0}).`);
  writeFileSync(`${ROOT}/BENCHMARK-RESULTS.md`, lines.join("\n") + "\n");
  console.log(`\nwrote BENCHMARK-RESULTS.md`);
}
