import { test } from "node:test";
import assert from "node:assert/strict";
import { treatmentCounts, hiddenAnswers, splitCases, naturalName, hitMetrics } from "../lib/benchmark.mjs";

test("MeSH's inverted disease names read naturally in questions", () => {
  assert.equal(naturalName("Glaucoma, Angle-Closure"), "Angle-Closure Glaucoma");
  assert.equal(naturalName("Leukemia, Myeloid, Acute"), "Acute Myeloid Leukemia");
  assert.equal(naturalName("Gout"), "Gout");
});

test("hit metrics: an answer in the top 10, the share in the top 50, each answer's rank, and the chance levels", () => {
  const ranked = Array.from({ length: 100 }, (_, i) => ({ substance: `s${i + 1}` }));
  const m = hitMetrics(ranked, ["s3", "s60", "never ranked"]);
  assert.equal(m.anyInTop10, true);
  assert.equal(m.shareInTop50, 1 / 3);
  assert.deepEqual(m.ranks, { s3: 3, s60: 60, "never ranked": null });
  // a random order of the same 100 puts one of the 2 ranked answers in the top 10 with 1 - (90·89)/(100·99)
  assert.ok(Math.abs(m.chanceTop10 - (1 - (90 * 89) / (100 * 99))) < 1e-12);
  assert.ok(Math.abs(m.chanceTop50 - (50 / 100) * (2 / 3)) < 1e-12);
});

const rec = (mesh) => ({ mesh: mesh.map(([name, ...quals]) => ({ name, quals })) });

test("a treatment study = the disease tagged 'drug therapy' and the substance tagged 'therapeutic use'", () => {
  const counts = treatmentCounts([
    rec([["Gout", "drug therapy"], ["Colchicine", "therapeutic use"], ["Uric Acid", "blood"]]),
    rec([["Gout", "drug therapy"], ["Colchicine", "therapeutic use", "adverse effects"]]),
    rec([["Gout", "diagnosis"], ["Allopurinol", "therapeutic use"]]), // not a gout treatment study
  ], "Gout");
  assert.deepEqual([...counts], [["Colchicine", 2]]);
});

test("hidden answers need 2+ treatment papers, and can't be already known or a drug-category label", () => {
  const counts = new Map([["A", 3], ["B", 1], ["Known", 5], ["Anti-Inflammatory Agents", 4], ["C", 2]]);
  const answers = hiddenAnswers(counts, { isKnown: (s) => s === "Known", isExcluded: (s) => s.endsWith("Agents") });
  assert.deepEqual(answers, [{ substance: "A", papers: 3 }, { substance: "C", papers: 2 }]);
});

test("cases split into practice and exam the same way every time, half each", () => {
  const cases = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const split = splitCases(cases, 1995);
  assert.deepEqual(split, splitCases(cases, 1995));
  assert.equal(split.practice.length, 5);
  assert.equal(split.exam.length, 5);
  assert.deepEqual([...split.practice, ...split.exam].sort(), cases);
});
