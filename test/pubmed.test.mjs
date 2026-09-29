import { test } from "node:test";
import assert from "node:assert/strict";
import { splitYears, sampleIds, eutils } from "../lib/pubmed.mjs";

test("a connection that drops while the response is downloading is retried", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return { ok: true, status: 200, text: async () => { if (calls === 1) throw new TypeError("terminated"); return "PMID- 1"; } };
  };
  const body = await eutils("efetch.fcgi", { id: "1" }, { fetchImpl, sleepImpl: async () => {} });
  assert.equal(body, "PMID- 1");
  assert.equal(calls, 2);
});

test("a 408 timeout from PubMed is retried, not treated as a bad request", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return calls === 1 ? { ok: false, status: 408 } : { ok: true, status: 200, text: async () => "PMID- 1" };
  };
  const body = await eutils("efetch.fcgi", { id: "1" }, { fetchImpl, sleepImpl: async () => {} });
  assert.equal(body, "PMID- 1");
  assert.equal(calls, 2);
});

// PubMed's search returns at most 9,999 ids, so big queries are split into year ranges
const perYear = (counts) => async (lo, hi) => {
  let n = 0;
  for (let y = lo; y <= hi; y++) n += counts[y] ?? 0;
  return n;
};

test("splits a year range until every piece is under the limit, covering every year once", async () => {
  const counts = { 1980: 4000, 1981: 4000, 1982: 4000, 1983: 4000, 1984: 4000, 1985: 4000 };
  const ranges = await splitYears(perYear(counts), 1980, 1985, 9999);
  const years = ranges.flatMap(([lo, hi]) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
  assert.deepEqual(years, [1980, 1981, 1982, 1983, 1984, 1985]);
  for (const [lo, hi] of ranges) assert.ok((await perYear(counts)(lo, hi)) <= 9999, `${lo}-${hi}`);
});

test("a range already under the limit stays whole", async () => {
  assert.deepEqual(await splitYears(perYear({ 1900: 5, 1985: 5 }), 1800, 1985, 9999), [[1800, 1985]]);
});

test("a single year over the limit is an error, not silent data loss", async () => {
  await assert.rejects(splitYears(perYear({ 1985: 20000 }), 1985, 1985, 9999), /1985/);
});

test("sampling is repeatable for the same seed and returns distinct ids from the list", () => {
  const ids = Array.from({ length: 1000 }, (_, i) => String(i));
  const a = sampleIds(ids, 100, 1986);
  assert.deepEqual(a, sampleIds(ids, 100, 1986));
  assert.equal(new Set(a).size, 100);
  assert.ok(a.every((id) => ids.includes(id)));
  assert.notDeepEqual(a, sampleIds(ids, 100, 7));
});

test("sampling a list that already fits returns all of it", () => {
  assert.deepEqual(sampleIds(["3", "1", "2"], 10, 1986), ["3", "1", "2"]);
});
