// Live dashboard for a run: node scripts/dashboard.mjs → http://localhost:4392
// Reads the answer file as the run appends to it; never touches the run itself.
import { createServer } from "node:http";
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { readJsonl } from "../lib/jsonl.mjs";
import { lineReader, tracker } from "../lib/progress.mjs";
import { file } from "./common.mjs";

const PORT = Number(process.env.PORT) || 4392;
const PAGE = new URL("../dashboard/index.html", import.meta.url);
const readJson = (name) => (existsSync(file(name)) ? JSON.parse(readFileSync(file(name), "utf8")) : null);

const papers = readJsonl(file("bridge-papers.jsonl")).filter((p) => p.chems.length && p.bridges.length);
const chars = new Map(papers.map((p) => [p.pmid, p.title.length + p.abstract.length]));
const bridges = readJson("bridges.json") ?? [];
const perBridge = Object.fromEntries(bridges.map((b) => [b.measure, { measure: b.measure, direction: b.direction, done: 0, total: 0 }]));
for (const p of papers) for (const b of p.bridges) if (perBridge[b]) perBridge[b].total += p.chems.length;
const questionTotal = Object.values(perBridge).reduce((n, b) => n + b.total, 0);

const log = file("stage2.log");
const startedAt = existsSync(log) ? statSync(log).birthtimeMs : Date.now();
const progress = tracker({ total: papers.length, charsOf: (pmid) => chars.get(pmid) ?? 0, startedAt });
const history = [[startedAt, 0]];
const stage1 = readJsonl(file("stage1.jsonl"));

let offset = 0;
const decoder = new StringDecoder("utf8");
const parse = lineReader();

function poll() {
  const now = Date.now();
  let rows = [];
  if (existsSync(file("stage2.jsonl"))) {
    const fd = openSync(file("stage2.jsonl"), "r");
    const size = fstatSync(fd).size;
    if (size > offset) {
      const buf = Buffer.alloc(size - offset);
      readSync(fd, buf, 0, buf.length, offset);
      offset = size;
      rows = parse(decoder.write(buf));
    }
    closeSync(fd);
  }
  for (const r of rows) for (const { measure } of Object.values(r.ids)) if (perBridge[measure]) perBridge[measure].done++;
  progress.add(rows, now);
  if (now - history[history.length - 1][0] >= 5000) history.push([now, progress.snapshot(now).done]);
}
poll();
setInterval(poll, 1000);

function stats() {
  const now = Date.now();
  const snap = progress.snapshot(now);
  const logText = existsSync(log) ? readFileSync(log, "utf8") : "";
  const ranking = readJson("ranking.json");
  return {
    now,
    startedAt,
    finished: snap.done >= snap.total || /\ndone: /.test(logText),
    progress: snap,
    questionTotal,
    history: [...history, [now, snap.done]],
    bridges: Object.values(perBridge),
    errors: readJsonl(file("stage2-errors.jsonl")).length,
    stage1: { papers: stage1.length, bridges: bridges.length, tokens: stage1.reduce((n, r) => n + (r.usage?.input_tokens ?? 0), 0) },
    result: ranking && { verdict: ranking.verdict, bestPrimary: ranking.bestPrimary, candidates: ranking.primary.ranked.length, family: ranking.family },
  };
}

createServer((req, res) => {
  if (req.url === "/stats") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify(stats()));
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(readFileSync(PAGE));
}).listen(PORT, "127.0.0.1", () => console.log(`Dashboard: http://localhost:${PORT}`));
