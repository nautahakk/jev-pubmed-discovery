import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySubstance, overlapWeights, specificityWeights, rankWeighted } from "../lib/rules.mjs";

test("drug-category labels are sorted out as categories", () => {
  assert.equal(classifySubstance(["D27.505.954.411"]), "category");
});

test("enzymes and receptors are sorted out as targets", () => {
  for (const tn of ["D08.811.277", "D12.776.543.750.705", "D12.776.826.100", "D12.776.827.300"]) {
    assert.equal(classifySubstance([tn]), "target", tn);
  }
});

test("everything else stays a candidate, including substances with no tree numbers", () => {
  assert.equal(classifySubstance(["D10.251.355.310"]), "candidate");
  assert.equal(classifySubstance([]), "candidate");
  assert.equal(classifySubstance(undefined), "candidate");
});

test("bridges in the same MeSH branch share one point between them", () => {
  const w = overlapWeights(["A", "B", "C"], { A: ["G09.330.553"], B: ["E01.1", "G09.330.950"], C: ["G09.188.261"] });
  assert.deepEqual(w, { A: 0.5, B: 0.5, C: 1 });
});

test("rarer bridges weigh more (log of how much rarer they are than PubMed as a whole)", () => {
  assert.deepEqual(specificityWeights({ A: 100, B: 10000 }, 1e6), { A: 4, B: 2 });
});

test("the weighted ranking sums bridge weights and keeps targets and known substances in their own lists", () => {
  const ev = {
    X: { A: { support: ["1"], against: [] }, C: { support: ["2"], against: [] } },
    Y: { A: { support: ["3", "4"], against: [] }, B: { support: ["5"], against: [] } },
    Receptor: { C: { support: ["6"], against: [] } },
    Known: { C: { support: ["7"], against: [] } },
  };
  const out = rankWeighted(ev, {
    weights: { A: 0.5, B: 0.5, C: 1 },
    classOf: (s) => (s === "Receptor" ? "target" : "candidate"),
    isKnown: (s) => s === "Known",
  });
  assert.deepEqual(out.ranked.map((r) => [r.substance, r.score]), [["X", 1.5], ["Y", 1]]);
  assert.deepEqual(out.targets.map((r) => r.substance), ["Receptor"]);
  assert.deepEqual(out.known.map((r) => r.substance), ["Known"]);
});
