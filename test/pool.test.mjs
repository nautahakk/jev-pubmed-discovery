import { test } from "node:test";
import assert from "node:assert/strict";
import { runPool } from "../lib/pool.mjs";
import { readJsonl, appendJsonl } from "../lib/jsonl.mjs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("the pool runs every item and never more than the concurrency limit at once", async () => {
  let inFlight = 0, peak = 0;
  const out = await runPool([1, 2, 3, 4, 5, 6, 7], async (x) => {
    inFlight++; peak = Math.max(peak, inFlight);
    await wait(10);
    inFlight--;
    return x * 2;
  }, { concurrency: 3 });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14]);
  assert.equal(peak, 3);
});

test("the pool spaces request starts to stay under a per-minute limit", async () => {
  const starts = [];
  await runPool([1, 2, 3, 4, 5], async () => { starts.push(Date.now()); }, { concurrency: 5, rpm: 1200 }); // 1 start per 50 ms
  // the k-th start never comes earlier than k slots after the first (2 ms of timer jitter allowed)
  for (let k = 1; k < starts.length; k++) assert.ok(starts[k] - starts[0] >= k * 50 - 2, `start ${k} after ${starts[k] - starts[0]} ms`);
});

test("a results file that doesn't exist yet reads as empty", () => {
  assert.deepEqual(readJsonl(join(tmpdir(), "does-not-exist-" + Date.now() + ".jsonl")), []);
});

test("appended rows read back, and a half-written last line (a crash mid-write) is skipped", () => {
  const f = join(mkdtempSync(join(tmpdir(), "jsonl-")), "rows.jsonl");
  appendJsonl(f, { pmid: "1" });
  appendJsonl(f, { pmid: "2" });
  assert.deepEqual(readJsonl(f), [{ pmid: "1" }, { pmid: "2" }]);
  writeFileSync(f, '{"pmid":"1"}\n{"pmid":"2"}\n{"pmid":"3","answ');
  assert.deepEqual(readJsonl(f), [{ pmid: "1" }, { pmid: "2" }]);
});
