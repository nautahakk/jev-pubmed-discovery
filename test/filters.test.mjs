import { test } from "node:test";
import assert from "node:assert/strict";
import { wasGiven, keepQuestions } from "../lib/filters.mjs";

const mesh = [
  { name: "Aspirin", quals: ["pharmacology"] },
  { name: "Fibrinogen", quals: ["blood"] },
  { name: "Platelet Aggregation", quals: ["drug effects"] },
];

test("a substance was given when PubMed tags its heading with a giving qualifier", () => {
  assert.equal(wasGiven(mesh, "Aspirin"), true);
});

test("a substance that was only measured was not given", () => {
  assert.equal(wasGiven(mesh, "Fibrinogen"), false);
});

test("a substance with no heading of its own can't be judged, so it's unknown", () => {
  assert.equal(wasGiven(mesh, "buflomedil"), null);
});

test("keepQuestions keeps only the questions that pass, and drops papers left with none", () => {
  const rows = [
    { pmid: "1", ids: { q0: { measure: "M", substance: "A" }, q1: { measure: "M", substance: "B" } }, answers: { q0: { choice: "lowers" }, q1: { choice: "raises" } } },
    { pmid: "2", ids: { q0: { measure: "M", substance: "B" } }, answers: { q0: { choice: "lowers" } } },
  ];
  const kept = keepQuestions(rows, (pmid, pair) => pair.substance === "A");
  assert.deepEqual(kept, [{ pmid: "1", ids: { q0: { measure: "M", substance: "A" } }, answers: { q0: { choice: "lowers" } } }]);
});
