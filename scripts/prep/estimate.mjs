// Prep: prices the hidden-years test per disease, from measured fish-oil-run ratios. Free.
import { readJsonl } from "../../lib/jsonl.mjs";
import { file, readJson, PRICE_PER_MTOK } from "../common.mjs";

const CAP = 10000;
const bench = readJson("benchmark.json");
const plans = readJson("reading-plans.json").plans;

// Ratios measured on the fish-oil run
const sizes = readJson("bridge-sizes.json");
const papers = readJsonl(file("bridge-papers.jsonl"));
const rows = readJsonl(file("stage2.jsonl"));
const uniqueShare = papers.length / sizes.reduce((n, s) => n + s.used, 0);               // links share papers
const chemShare = papers.filter((p) => p.chems.length).length / papers.length;           // papers that list substances
const tokensPerPaper = rows.reduce((n, r) => n + r.usage.input_tokens, 0) / rows.length; // reading everything
const planShare = plans.find((p) => p.plan.startsWith("...or the measure")).costShare;  // the chosen reading plan
const RPM = 900;

console.log(`measured on the fish-oil run: ${Math.round(uniqueShare * 100)}% of link papers are distinct, ${Math.round(chemShare * 100)}% list substances, ${Math.round(tokensPerPaper)} tokens per paper, reading plan = ${Math.round(planShare * 100)}% of the cost\n`);
let total = 0, totalMin = 0;
const out = [];
for (const d of bench.diseases) {
  const linkPapers = d.likelyBridges.reduce((n, b) => n + Math.min(b.papers, CAP), 0);
  const read = linkPapers * uniqueShare * chemShare;
  const step2 = ((read * tokensPerPaper * planShare) / 1e6) * PRICE_PER_MTOK;
  const dollars = d.step1.dollars + step2;
  const minutes = (d.step1.papers + read * 0.75) / RPM; // the plan skips roughly a quarter of the papers entirely
  total += dollars;
  totalMin += minutes;
  const group = bench.split.practice.includes(d.disease) ? "practice" : "exam";
  out.push({ disease: d.disease, group, dollars, minutes });
  console.log(`${group.padEnd(8)} ${d.disease}: about $${dollars.toFixed(2)}, ${Math.round(minutes)} min (step 1 ${d.step1.papers} papers, ~${Math.round(read)} bridge papers to read)`);
}
const sum = (g, k) => out.filter((o) => o.group === g).reduce((n, o) => n + o[k], 0);
console.log(`\npractice: about $${sum("practice", "dollars").toFixed(2)}, ${Math.round(sum("practice", "minutes") / 60 * 10) / 10} h`);
console.log(`exam:     about $${sum("exam", "dollars").toFixed(2)}, ${Math.round(sum("exam", "minutes") / 60 * 10) / 10} h`);
console.log(`all 10:   about $${total.toFixed(2)}, ${Math.round(totalMin / 60 * 10) / 10} h (before savings from answers shared between diseases)`);
