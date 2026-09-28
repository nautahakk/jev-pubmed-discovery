// Step 3: rank substances by the protocol's rules and write RESULTS.md. No model involved.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readJsonl } from "../lib/jsonl.mjs";
import { linkEvidence, rankSubstances, knownChecker, isFishOil, baselineRank } from "../lib/score.mjs";
import { file, readJson, writeJson, PRICE_PER_MTOK } from "./common.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BROADER = ["Dietary Fats, Unsaturated", "Fatty Acids, Unsaturated"];

const raynaud = readJsonl(file("raynaud.jsonl"));
const bridges = readJson("bridges.json");
const sizes = readJson("bridge-sizes.json");
const papers = readJsonl(file("bridge-papers.jsonl"));
const stage1 = readJsonl(file("stage1.jsonl"));
const stage2 = readJsonl(file("stage2.jsonl"));
const errors = { stage1: readJsonl(file("stage1-errors.jsonl")).length, stage2: readJsonl(file("stage2-errors.jsonl")).length };

const isKnown = knownChecker(raynaud);
const evidence = linkEvidence(stage2, bridges);
const primary = rankSubstances(evidence, { isKnown, minSupport: 1 });
const secondary = rankSubstances(evidence, { isKnown, minSupport: 2 });
const baseline = baselineRank(papers.filter((p) => p.chems.length), bridges, { isKnown });

const position = (list, name) => {
  const i = list.ranked.findIndex((r) => r.substance === name);
  if (i >= 0) return i + 1;
  return list.known.some((r) => r.substance === name) ? "known" : null;
};
const family = [...new Set([...Object.keys(evidence), ...baseline.ranked.map((r) => r.substance), ...baseline.known.map((r) => r.substance)])]
  .filter(isFishOil)
  .sort();
const familyRows = family.map((name) => ({
  name,
  primary: position(primary, name),
  secondary: position(secondary, name),
  baseline: position(baseline, name),
  row: primary.ranked.find((r) => r.substance === name) ?? primary.known.find((r) => r.substance === name),
}));
const numeric = (xs) => xs.filter((x) => typeof x === "number");
const best = (key) => (numeric(familyRows.map((r) => r[key])).length ? Math.min(...numeric(familyRows.map((r) => r[key]))) : null);
const bestPrimary = best("primary");
const verdict = bestPrimary === null ? "FAIL (fish oil not ranked)" : bestPrimary <= 10 ? "PASS" : bestPrimary <= 50 ? "PARTIAL" : "FAIL";

// Evidence behind each fish-oil-family link: the papers and Jev's probability for the helpful answer
const byPmid = new Map(papers.map((p) => [p.pmid, p]));
const probOf = new Map();
for (const row of stage2) {
  for (const [qid, { measure, substance }] of Object.entries(row.ids)) {
    probOf.set(`${row.pmid}|${substance}|${measure}`, row.answers[qid]?.probabilities ?? {});
  }
}
const direction = new Map(bridges.map((b) => [b.measure, b.direction]));
const helpfulOf = (m) => (direction.get(m) === "higher" ? "lowers" : "raises");

const tokens = (rows) => rows.reduce((n, r) => n + (r.usage?.input_tokens ?? 0), 0);
const t1 = tokens(stage1), t2 = tokens(stage2);
const models = [...new Set([...stage1, ...stage2].map((r) => r.model))].join(", ");
const questions2 = stage2.reduce((n, r) => n + Object.keys(r.ids).length, 0);
const protocolCommit = execSync("git log --format=%h -1 -- PROTOCOL.md", { cwd: ROOT }).toString().trim();
const link = (pmid) => `[${pmid}](https://pubmed.ncbi.nlm.nih.gov/${pmid}/)`;
const cell = (s) => String(s).replace(/\|/g, "\\|");
const rankCell = (x) => (x === null ? "not ranked" : x === "known" ? "already known" : `#${x}`);

const md = [];
md.push("# Fish-oil rediscovery test: results", "");
md.push(`Run on ${new Date().toISOString().slice(0, 10)} with the rules in [PROTOCOL.md](PROTOCOL.md), committed before the run (\`${protocolCommit}\`).`, "");
md.push(`## Headline: ${verdict}`, "");
md.push(bestPrimary === null
  ? "No fish-oil-family substance earned a point, so fish oil was not found."
  : `The best-ranked fish-oil-family substance is **#${bestPrimary} of ${primary.ranked.length}** new candidates for Raynaud's (pass = top 10, partial = top 50).`, "");
md.push("| Substance | Rank (headline) | Rank (2+ papers per link) | Rank without Jev (co-occurrence only) | Links (bridges) |", "|---|---|---|---|---|");
for (const f of familyRows) md.push(`| ${cell(f.name)} | ${rankCell(f.primary)} | ${rankCell(f.secondary)} | ${rankCell(f.baseline)} | ${f.row ? f.row.bridges.join(", ") : "none"} |`);
if (!familyRows.length) md.push("| (no fish-oil-family substance appeared in any bridge paper) | | | | |");
md.push("");
md.push("Broader groups that include fish oil: " + BROADER.map((n) => `${n} ${rankCell(position(primary, n))}`).join("; ") + ".", "");

md.push("## Step 1: what Jev found abnormal in Raynaud's", "");
md.push(`Jev read ${stage1.length} Raynaud's papers from before 1986 that were indexed with a body measure (${errors.stage1} errors). ${bridges.length} measures became bridges:`, "");
md.push("| Bridge | In Raynaud's | Papers that say so | Opposite | No difference | Papers asked |", "|---|---|---|---|---|---|");
for (const b of bridges) md.push(`| ${b.measure} | ${b.direction} | ${b.votes} | ${b.opposite} | ${b.noDifference} | ${b.papers} |`);
md.push("");

md.push("## Step 2: what changes each bridge", "");
md.push("| Bridge | Papers before 1986 | Papers used |", "|---|---|---|");
for (const s of sizes) md.push(`| ${s.measure} | ${s.papers} | ${s.used} |`);
md.push("", `Jev read ${stage2.length} bridge papers that list at least one chemical and answered ${questions2} substance questions (${errors.stage2} papers failed).`, "");

const table = (rows, n, withKnownNote = false) => {
  const out = ["| # | Substance | Points (bridges) | Supporting papers | Bridges |", "|---|---|---|---|---|"];
  rows.slice(0, n).forEach((r, i) => out.push(`| ${i + 1} | ${cell(r.substance)}${withKnownNote && isFishOil(r.substance) ? " 🐟" : ""} | ${r.points} | ${r.support} | ${r.bridges.join(", ")} |`));
  return out;
};
md.push("## Top 25 new candidates (not linked to Raynaud's before 1986)", "", ...table(primary.ranked, 25, true), "");
md.push("## Already linked to Raynaud's before 1986 (sanity check: real treatments should score well)", "", ...table(primary.known, 15), "");
md.push("## Without Jev: ranking by co-occurrence alone (top 10)", "");
md.push("| # | Substance | Bridges it appears with | Papers |", "|---|---|---|---|");
baseline.ranked.slice(0, 10).forEach((r, i) => md.push(`| ${i + 1} | ${cell(r.substance)} | ${r.points} | ${r.papers} |`));
md.push("");

md.push("## The papers behind the fish-oil links", "");
md.push("Every paper Jev counted as support, with the probability it gave the helpful answer. Anyone can open them and check.", "");
for (const f of familyRows.filter((x) => evidence[x.name])) {
  md.push(`### ${f.name}`, "");
  for (const [measure, e] of Object.entries(evidence[f.name]).sort()) {
    if (!e.support.length && !e.against.length) continue;
    md.push(`**${measure}** (helpful = ${helpfulOf(measure)}): ${e.support.length} supporting, ${e.against.length} against, ${e.asked} asked`, "");
    for (const pmid of e.support) {
      const p = byPmid.get(pmid);
      const prob = probOf.get(`${pmid}|${f.name}|${measure}`)?.[helpfulOf(measure)];
      md.push(`- ${link(pmid)} (${p?.year}) ${p?.title ?? ""} *(p = ${prob?.toFixed(2)})*`);
    }
    for (const pmid of e.against) {
      const p = byPmid.get(pmid);
      md.push(`- against: ${link(pmid)} (${p?.year}) ${p?.title ?? ""}`);
    }
    md.push("");
  }
}

md.push("## Run facts", "");
md.push(`- Model: ${models}`);
md.push(`- Jev requests: ${stage1.length} (step 1) + ${stage2.length} papers (step 2)`);
md.push(`- Input tokens: ${t1.toLocaleString("en-US")} + ${t2.toLocaleString("en-US")}; cost about $${(((t1 + t2) / 1e6) * PRICE_PER_MTOK).toFixed(2)}`);
md.push(`- Raynaud's papers before 1986: ${raynaud.length} (${raynaud.filter((r) => r.abstract).length} with an abstract); none mention fish oil`);
md.push("");

writeFileSync(`${ROOT}/RESULTS.md`, md.join("\n"));
writeJson("ranking.json", { verdict, bestPrimary, family: familyRows.map(({ row, ...r }) => r), primary, secondary, baseline: { ranked: baseline.ranked.slice(0, 500), known: baseline.known.slice(0, 200) } });
console.log(`${verdict}: best fish-oil rank ${bestPrimary} of ${primary.ranked.length} new candidates`);
for (const f of familyRows) console.log(`  ${f.name}: headline ${rankCell(f.primary)}, 2+ papers ${rankCell(f.secondary)}, without Jev ${rankCell(f.baseline)}`);
console.log("Top 10 new candidates:");
primary.ranked.slice(0, 10).forEach((r, i) => console.log(`  ${i + 1}. ${r.substance} (${r.points} bridges, ${r.support} papers)`));
