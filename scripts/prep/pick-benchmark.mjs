// Prep: picks the hidden-years test diseases and their hidden answers, and prices the run.
// Free: PubMed and MeSH only, no Jev calls. Settings are fixed here, before any result exists.
import { count, allIds, fetchRecords, shuffle } from "../../lib/pubmed.mjs";
import { sparql, lookupTrees, isBodyProcess } from "../../lib/mesh.mjs";
import { knownChecker } from "../../lib/score.mjs";
import { treatmentCounts, hiddenAnswers, splitCases } from "../../lib/benchmark.mjs";
import { readJsonl } from "../../lib/jsonl.mjs";
import { file, readJson, writeJson, PRICE_PER_MTOK } from "../common.mjs";
import { existsSync } from "node:fs";

const CUTOFF = 1995;
const WINDOW = [1996, 2005];      // hidden answers: first tried as treatments in these years
const SEED = 1995;
const SIZE = [1000, 6000];        // papers about the disease up to the cutoff (Raynaud's had 2,646 up to 1985)
const MIN_TREATMENT_PAPERS = 20;  // drug-therapy papers about the disease in the window
const MIN_ANSWERS = 5;
const EXISTED = 20;               // an answer must have 20+ papers of its own before the cutoff (so it was findable)
const WANT = 50;

async function diseasePool() {
  const labels = new Set();
  for (let offset = 0; ; offset += 1000) {
    const query = `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX meshv: <http://id.nlm.nih.gov/mesh/vocab#>
SELECT DISTINCT ?label FROM <http://id.nlm.nih.gov/mesh> WHERE {
  ?d a meshv:TopicalDescriptor ; rdfs:label ?label ; meshv:treeNumber ?t . ?t rdfs:label ?tn .
  FILTER(REGEX(?tn, "^C(0[1-9]|1[0-9]|20)[.]"))
} ORDER BY ?label`;
    const bindings = (await sparql(query, { offset })).results.bindings;
    bindings.forEach((b) => labels.add(b.label.value));
    if (bindings.length < 1000) break;
  }
  return [...labels].sort();
}

// Token cost of a step 1 request, fitted on the fish-oil run: paper text + each question
function stage1Model() {
  const byPmid = new Map(readJsonl(file("raynaud.jsonl")).map((r) => [r.pmid, r]));
  const fit = (rows) => {
    const pts = rows.map((r) => [Object.keys(r.ids).length, r.usage.input_tokens]);
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const b = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
    return { base: my - b * mx, perQuestion: b };
  };
  const rows = readJsonl(file("stage1.jsonl"));
  return { abstract: fit(rows.filter((r) => byPmid.get(r.pmid)?.abstract)), title: fit(rows.filter((r) => !byPmid.get(r.pmid)?.abstract)) };
}

const cachePath = "benchmark-trees.json";
const trees = existsSync(file(cachePath)) ? readJson(cachePath) : {};
async function treesFor(labels) {
  const missing = labels.filter((l) => !(l in trees));
  if (missing.length) {
    const found = await lookupTrees(missing);
    for (const l of missing) trees[l] = found[l] ?? [];
    writeJson(cachePath, trees);
  }
  return trees;
}

const s1 = stage1Model();
const pool = shuffle(await diseasePool(), SEED);
console.log(`disease pool: ${pool.length} MeSH headings (C01–C20), shuffled with seed ${SEED}`);
// Progress is saved after every disease, so a crash resumes instead of starting over
const progressFile = "benchmark-progress.json";
const { picked, tried } = existsSync(file(progressFile)) ? readJson(progressFile) : { picked: [], tried: [] };
const seen = new Set(tried.map((t) => t.disease));
if (seen.size) console.log(`resuming: ${picked.length} picked out of ${tried.length} already tried`);
for (const disease of pool) {
  if (picked.length >= WANT) break;
  if (seen.has(disease)) continue;
  writeJson(progressFile, { picked, tried });
  const entry = { disease, papersBefore: await count(`"${disease}"[mh:noexp] AND 1800:${CUTOFF}[dp]`) };
  tried.push(entry);
  if (entry.papersBefore < SIZE[0] || entry.papersBefore > SIZE[1]) { entry.skip = "size"; continue; }
  entry.treatmentPapers = await count(`"${disease}/drug therapy"[mh:noexp] AND ${WINDOW[0]}:${WINDOW[1]}[dp]`);
  if (entry.treatmentPapers < MIN_TREATMENT_PAPERS) { entry.skip = "few treatment studies"; continue; }

  const before = await fetchRecords(await allIds(`"${disease}"[mh:noexp]`, 1800, CUTOFF));
  const later = await fetchRecords(await allIds(`"${disease}/drug therapy"[mh:noexp]`, WINDOW[0], WINDOW[1]));
  const counts = treatmentCounts(later, disease);
  await treesFor([...counts.keys()]);
  const isClass = (s) => (trees[s] ?? []).some((t) => t.startsWith("D27")); // drug-category labels, not drugs
  let answers = hiddenAnswers(counts, { isKnown: knownChecker(before), isExcluded: isClass });
  for (const a of answers) a.papersBeforeCutoff = await count(`"${a.substance}"[mh:noexp] AND 1800:${CUTOFF}[dp]`);
  answers = answers.filter((a) => a.papersBeforeCutoff >= EXISTED);
  entry.answers = answers.length;
  if (answers.length < MIN_ANSWERS) { entry.skip = "few hidden answers"; continue; }

  // Step 1 size and price: papers carrying at least one body measure
  const labels = [...new Set(before.flatMap((r) => r.mesh.map((m) => m.name)))];
  await treesFor(labels);
  let requests = 0, tokens = 0;
  const freq = new Map();
  for (const r of before) {
    const ms = [...new Set(r.mesh.map((m) => m.name).filter((n) => isBodyProcess(trees[n])))];
    if (!ms.length) continue;
    requests++;
    const m = r.abstract ? s1.abstract : s1.title;
    tokens += m.base + m.perQuestion * ms.length;
    ms.forEach((x) => freq.set(x, (freq.get(x) ?? 0) + 1));
  }
  // Rough step 2 size: the 15 most common measures stand in for the bridges Jev would pick
  const likelyBridges = [...freq].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([m]) => m);
  const bridgeSizes = [];
  for (const m of likelyBridges) bridgeSizes.push({ measure: m, papers: await count(`"${m}"[mh:noexp] AND 1800:${CUTOFF}[dp]`) });
  picked.push({ ...entry, step1: { papers: requests, dollars: (tokens / 1e6) * PRICE_PER_MTOK }, likelyBridges: bridgeSizes, answers });
  console.log(`  ✓ ${disease}: ${entry.papersBefore} papers before ${CUTOFF + 1}, ${answers.length} hidden answers, step 1 = ${requests} papers ($${((tokens / 1e6) * PRICE_PER_MTOK).toFixed(3)})`);
}

const split = splitCases(picked.map((p) => p.disease), SEED);
writeJson("benchmark.json", { settings: { CUTOFF, WINDOW, SEED, SIZE, MIN_TREATMENT_PAPERS, MIN_ANSWERS, EXISTED }, split, diseases: picked, tried });
console.log(`\npicked ${picked.length} of ${tried.length} tried; practice: ${split.practice.join(", ")}; exam: ${split.exam.length} diseases (answers sealed in benchmark.json)`);
