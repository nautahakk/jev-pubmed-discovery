// Step 2b: Jev reads each bridge paper and says what each listed substance does to each bridge measure.
import { readJsonl, appendJsonl } from "../lib/jsonl.mjs";
import { stage2Request } from "../lib/questions.mjs";
import { systemOne } from "../lib/jev.mjs";
import { runPool } from "../lib/pool.mjs";
import { file, JEV, PRICE_PER_MTOK, apiKey, progress } from "./common.mjs";

const MAX_QUESTIONS = 120; // per request; bigger papers are split and their answers merged

const papers = readJsonl(file("bridge-papers.jsonl")).filter((p) => p.chems.length && p.bridges.length);
const out = file("stage2.jsonl");
const done = new Set(readJsonl(out).map((row) => row.pmid));
const pending = papers.filter((p) => !done.has(p.pmid));
const questions = pending.reduce((n, p) => n + p.chems.length * p.bridges.length, 0);
console.log(`${papers.length} bridge papers list chemicals; ${pending.length} still to ask (${questions} questions)`);

async function ask(key, paper) {
  const pairs = paper.bridges.flatMap((measure) => paper.chems.map((substance) => ({ measure, substance })));
  const row = { pmid: paper.pmid, ids: {}, answers: {}, usage: { input_tokens: 0 }, model: null };
  for (let start = 0; start < pairs.length; start += MAX_QUESTIONS) {
    const { body, ids } = stage2Request(paper, pairs.slice(start, start + MAX_QUESTIONS));
    const res = await systemOne({ apiKey: key, body });
    for (const [qid, pair] of Object.entries(ids)) {
      const id = `q${start + Number(qid.slice(1))}`;
      row.ids[id] = pair;
      row.answers[id] = res.answers[qid];
    }
    row.usage.input_tokens += res.usage?.input_tokens ?? 0;
    row.model = res.model;
  }
  return row;
}

const key = apiKey();
const t0 = Date.now();
let n = 0, tokens = 0, errors = 0;
await runPool(pending, async (paper) => {
  try {
    const row = await ask(key, paper);
    appendJsonl(out, row);
    tokens += row.usage.input_tokens;
  } catch (err) {
    errors++;
    appendJsonl(file("stage2-errors.jsonl"), { pmid: paper.pmid, error: err.message });
  }
  n++;
  if (n % 100 === 0 || n === pending.length) progress("asked", n, pending.length, t0, `, ${errors} errors, $${((tokens / 1e6) * PRICE_PER_MTOK).toFixed(2)}`);
}, JEV);
console.log(`\ndone: ${n} papers, ${errors} errors, ${tokens} input tokens, $${((tokens / 1e6) * PRICE_PER_MTOK).toFixed(2)}`);
