// Prep: how much of the fish-oil run's evidence each cheaper reading plan keeps, and what it costs.
// Free: re-uses the saved answers, no Jev calls.
import { readJsonl } from "../../lib/jsonl.mjs";
import { linkEvidence, rankSubstances, knownChecker, isFishOil } from "../../lib/score.mjs";
import { wasGiven, keepQuestions } from "../../lib/filters.mjs";
import { sampleIds } from "../../lib/pubmed.mjs";
import { file, readJson, writeJson, PRICE_PER_MTOK, SEED } from "../common.mjs";

const bridges = readJson("bridges.json");
const papers = readJsonl(file("bridge-papers.jsonl"));
const byPmid = new Map(papers.map((p) => [p.pmid, p]));
const meshOf = new Map(readJsonl(file("bridge-mesh.jsonl")).map((r) => [r.pmid, r.mesh]));
const rows = readJsonl(file("stage2.jsonl"));
const isKnown = knownChecker(readJsonl(file("raynaud.jsonl")));

// The substance–bridge links that earn a point under the headline rule, with their supporting papers
function links(rs) {
  const evidence = linkEvidence(rs, bridges);
  const { ranked, known } = rankSubstances(evidence, { isKnown });
  return new Map([...ranked, ...known].flatMap((r) => r.bridges.map((b) => [`${r.substance}|${b}`, evidence[r.substance][b].support.length])));
}
// Token cost model fitted on this run: the paper's text once, plus each question
const tokens = (rs) => rs.reduce((n, r) => n + (byPmid.get(r.pmid)?.abstract ? 524 : 288) + 187 * Object.keys(r.ids).length, 0);

function randomCap(cap) {
  const kept = {};
  for (const b of bridges) kept[b.measure] = new Set(sampleIds(papers.filter((p) => p.bridges.includes(b.measure)).map((p) => p.pmid), cap, SEED));
  return (pmid, pair) => kept[pair.measure].has(pmid);
}
const given = (pmid, pair) => wasGiven(meshOf.get(pmid) ?? [], pair.substance);
const drugEffects = (pmid, pair) => (meshOf.get(pmid) ?? []).some((h) => h.name === pair.measure && h.quals.includes("drug effects"));

const plans = [
  ["Read everything (what we ran)", () => true],
  ["Random 5,000 papers per link", randomCap(5000)],
  ["Random 2,000 papers per link", randomCap(2000)],
  ["Only substances tagged as given", (pmid, pair) => given(pmid, pair) === true],
  ["Tagged as given, or no tag to judge by", (pmid, pair) => given(pmid, pair) !== false],
  ["...or the measure is tagged 'drug effects'", (pmid, pair) => given(pmid, pair) !== false || drugEffects(pmid, pair)],
];

const full = links(rows);
const fullTokens = tokens(rows);
const rare = [...full].filter(([, n]) => n === 1).map(([k]) => k);
const fish = [...full.keys()].filter((k) => isFishOil(k.split("|")[0]));
const out = [];
for (const [name, keep] of plans) {
  const rs = keepQuestions(rows, keep);
  const found = links(rs);
  const t = tokens(rs);
  out.push({
    plan: name,
    papers: rs.length,
    questions: rs.reduce((n, r) => n + Object.keys(r.ids).length, 0),
    costShare: t / fullTokens,
    dollars: (t / 1e6) * PRICE_PER_MTOK,
    linksKept: [...full.keys()].filter((k) => found.has(k)).length / full.size,
    rareKept: rare.filter((k) => found.has(k)).length / rare.length,
    fishKept: `${fish.filter((k) => found.has(k)).length} of ${fish.length}`,
  });
}
writeJson("reading-plans.json", { links: full.size, rareLinks: rare.length, fishLinks: fish, plans: out });
console.log(`${full.size} links earned a point in the full run; ${rare.length} of them rest on a single paper (the rare, discovery-type ones)\n`);
const pct = (x) => `${Math.round(x * 100)}%`;
console.log("plan | papers | questions | cost | links kept | single-paper links kept | fish-oil links kept");
for (const o of out) console.log(`${o.plan} | ${o.papers} | ${o.questions} | ${pct(o.costShare)} ($${o.dollars.toFixed(2)}) | ${pct(o.linksKept)} | ${pct(o.rareKept)} | ${o.fishKept}`);
