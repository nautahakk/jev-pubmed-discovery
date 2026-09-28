import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stage1Votes, selectBridges, linkEvidence, rankSubstances,
  knownChecker, isFishOil, rankOf, baselineRank,
} from "../lib/score.mjs";

// A step 1 answer row: one paper, one question per measure
const s1 = (pmid, measure, probabilities) => ({ pmid, ids: { m0: measure }, answers: { m0: { probabilities } } });
const p = (opt, prob = 0.8) => ({ higher: 0, lower: 0, abnormal_unclear: 0, no_difference: 0, not_reported: 0, [opt]: prob });

test("a paper votes for an option only when it has probability 0.5 or more", () => {
  const votes = stage1Votes([
    s1("1", "Blood Viscosity", { ...p("higher", 0.5), not_reported: 0.5 }),
    s1("2", "Blood Viscosity", { ...p("higher", 0.49), not_reported: 0.51 }),
  ]);
  assert.equal(votes["Blood Viscosity"].counts.higher, 1);
  assert.equal(votes["Blood Viscosity"].counts.not_reported, 2);
  assert.equal(votes["Blood Viscosity"].papers, 2);
  assert.deepEqual(votes["Blood Viscosity"].pmids.higher, ["1"]);
});

test("a measure becomes a bridge with 2+ agreeing votes that beat the opposite direction and 'no difference'", () => {
  const rows = [];
  const add = (measure, opt, n) => { for (let i = 0; i < n; i++) rows.push(s1(`${measure}${opt}${i}`, measure, p(opt))); };
  add("A", "higher", 2); add("A", "lower", 1);          // bridge, higher
  add("B", "higher", 2); add("B", "lower", 2);          // tie: no
  add("C", "lower", 2); add("C", "no_difference", 2);   // doesn't beat no-difference: no
  add("D", "higher", 1);                                // too few: no
  add("E", "lower", 3); add("E", "no_difference", 1);   // bridge, lower
  const bridges = selectBridges(stage1Votes(rows));
  assert.deepEqual(bridges.map((b) => [b.measure, b.direction, b.votes]), [["E", "lower", 3], ["A", "higher", 2]]);
});

const bridges = [
  { measure: "Blood Viscosity", direction: "higher" },
  { measure: "Erythrocyte Deformability", direction: "lower" },
];
const s2 = (pmid, pairs) => ({
  pmid,
  ids: Object.fromEntries(pairs.map(([measure, substance], i) => [`q${i}`, { measure, substance }])),
  answers: Object.fromEntries(pairs.map(([, , opt, prob = 0.8], i) => [`q${i}`, { probabilities: { lowers: 0, raises: 0, no_effect: 0, not_reported: 0, [opt]: prob } }])),
});

test("the helpful direction is the opposite of what's abnormal in Raynaud's", () => {
  const ev = linkEvidence([
    s2("1", [["Blood Viscosity", "X", "lowers"], ["Erythrocyte Deformability", "X", "raises"]]),
    s2("2", [["Blood Viscosity", "X", "raises"], ["Erythrocyte Deformability", "X", "lowers"]]),
    s2("3", [["Blood Viscosity", "X", "not_reported"]]),
  ], bridges);
  assert.deepEqual(ev.X["Blood Viscosity"], { support: ["1"], against: ["2"], asked: 3 });
  assert.deepEqual(ev.X["Erythrocyte Deformability"], { support: ["1"], against: ["2"], asked: 2 });
});

test("answers about measures that aren't bridges are ignored", () => {
  const ev = linkEvidence([s2("1", [["Heart Rate", "X", "lowers"]])], bridges);
  assert.deepEqual(ev, {});
});

test("a substance earns a point per bridge where support outnumbers against", () => {
  const ev = {
    X: { "Blood Viscosity": { support: ["1", "2"], against: [] }, "Erythrocyte Deformability": { support: ["3"], against: ["4"] } },
    Y: { "Blood Viscosity": { support: ["5"], against: [] }, "Erythrocyte Deformability": { support: ["6"], against: [] } },
  };
  const { ranked } = rankSubstances(ev);
  assert.deepEqual(ranked.map((r) => [r.substance, r.points, r.support]), [["Y", 2, 2], ["X", 1, 2]]);
  assert.deepEqual(ranked[1].bridges, ["Blood Viscosity"]);
});

test("ties break on supporting papers, then name; substances with no points aren't ranked", () => {
  const ev = {
    B: { "Blood Viscosity": { support: ["1"], against: [] } },
    A: { "Blood Viscosity": { support: ["2"], against: [] } },
    C: { "Blood Viscosity": { support: ["3", "4"], against: [] } },
    D: { "Blood Viscosity": { support: [], against: ["5"] } },
  };
  assert.deepEqual(rankSubstances(ev).ranked.map((r) => r.substance), ["C", "A", "B"]);
});

test("known substances go in their own list, not the new-candidate ranking", () => {
  const ev = { Nifedipine: { "Blood Viscosity": { support: ["1"], against: [] } }, X: { "Blood Viscosity": { support: ["2"], against: [] } } };
  const { ranked, known } = rankSubstances(ev, { isKnown: (s) => s === "Nifedipine" });
  assert.deepEqual(ranked.map((r) => r.substance), ["X"]);
  assert.deepEqual(known.map((r) => r.substance), ["Nifedipine"]);
});

test("the secondary ranking needs at least 2 supporting papers per bridge", () => {
  const ev = { X: { "Blood Viscosity": { support: ["1"], against: [] } }, Y: { "Blood Viscosity": { support: ["2", "3"], against: [] } } };
  assert.deepEqual(rankSubstances(ev, { minSupport: 2 }).ranked.map((r) => r.substance), ["Y"]);
});

test("a substance is known when a Raynaud paper indexes it", () => {
  const isKnown = knownChecker([{ title: "", abstract: "", mesh: [{ name: "Reserpine" }], chems: ["Nifedipine"] }]);
  assert.equal(isKnown("Nifedipine"), true);
  assert.equal(isKnown("reserpine"), true);
  assert.equal(isKnown("Aspirin"), false);
});

test("a substance is known when its name is a whole word in a Raynaud title or abstract", () => {
  const isKnown = knownChecker([{ title: "Treatment of Raynaud's with GUANETHIDINE", abstract: "A cold environment.", mesh: [], chems: [] }]);
  assert.equal(isKnown("Guanethidine"), true);
  assert.equal(isKnown("Iron"), false); // "environment" contains "iron" but not as a word
});

test("the fish-oil family matches the names in the protocol and nothing broader", () => {
  for (const n of ["Fish Oils", "Cod Liver Oil", "Eicosapentaenoic Acid", "Icosapent", "Docosahexaenoic Acids", "Fatty Acids, Omega-3", "n-3 fatty acids", "Menhaden oil", "marine oils"]) {
    assert.equal(isFishOil(n), true, n);
  }
  for (const n of ["Dietary Fats, Unsaturated", "Fatty Acids, Unsaturated", "Olive Oil", "Linseed Oil", "Arachidonic Acid"]) {
    assert.equal(isFishOil(n), false, n);
  }
});

test("rankOf gives the 1-based rank of the first match, or null", () => {
  const list = [{ substance: "A" }, { substance: "Fish Oils" }];
  assert.equal(rankOf(list, (r) => isFishOil(r.substance)), 2);
  assert.equal(rankOf(list, (r) => r.substance === "Z"), null);
});

test("the baseline gives a point per bridge a substance merely appears with", () => {
  const papers = [
    { pmid: "1", bridges: ["Blood Viscosity", "Erythrocyte Deformability"], chems: ["A"] },
    { pmid: "2", bridges: ["Blood Viscosity"], chems: ["B"] },
    { pmid: "3", bridges: ["Blood Viscosity"], chems: ["B", "Nifedipine"] },
    { pmid: "4", bridges: ["Blood Viscosity"], chems: ["C"] },
  ];
  const { ranked, known } = baselineRank(papers, bridges, { isKnown: (s) => s === "Nifedipine" });
  assert.deepEqual(ranked.map((r) => [r.substance, r.points, r.papers]), [["A", 2, 1], ["B", 1, 2], ["C", 1, 1]]);
  assert.deepEqual(known.map((r) => r.substance), ["Nifedipine"]);
});
