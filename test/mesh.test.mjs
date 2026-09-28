import { test } from "node:test";
import assert from "node:assert/strict";
import { isBodyProcess, treeQuery, parseTrees } from "../lib/mesh.mjs";

test("a heading is a body process when any of its tree numbers is in an allowed G branch", () => {
  assert.equal(isBodyProcess(["E01.370.600.875.500", "G09.330.380.500"]), true);
  for (const tn of ["G03.1", "G04.1", "G07.1", "G08.1", "G10.1", "G11.1", "G12.1", "G13.1", "G14.1"]) {
    assert.equal(isBodyProcess([tn]), true, tn);
  }
});

test("the left-out G branches don't count", () => {
  for (const tn of ["G01.358.500", "G02.111", "G05.1", "G06.1", "G15.1", "G16.1", "G17.1"]) {
    assert.equal(isBodyProcess([tn]), false, tn);
  }
});

test("headings outside the G tree, or with no tree numbers, don't count", () => {
  assert.equal(isBodyProcess(["A17.600", "C14.907"]), false);
  assert.equal(isBodyProcess([]), false);
  assert.equal(isBodyProcess(undefined), false);
});

test("the SPARQL query escapes quotes in labels", () => {
  assert.match(treeQuery(['Say "hi"']), /"Say \\"hi\\""@en/);
});

test("parseTrees groups tree numbers by label, without duplicates", () => {
  const json = { results: { bindings: [
    { label: { value: "Heart Rate" }, tn: { value: "G09.330.380.500" } },
    { label: { value: "Heart Rate" }, tn: { value: "G09.330.380.500" } },
    { label: { value: "Heart Rate" }, tn: { value: "E01.370.600.875.500" } },
  ] } };
  assert.deepEqual(parseTrees(json), { "Heart Rate": ["E01.370.600.875.500", "G09.330.380.500"] });
});
