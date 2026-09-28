import { test } from "node:test";
import assert from "node:assert/strict";
import { MODEL, paperState, stage1Request, stage2Request } from "../lib/questions.mjs";

const paper = { pmid: "1", title: "Blood viscosity in Raynaud's disease", abstract: "" };

test("the model is pinned to a version, not the moving alias", () => {
  assert.equal(MODEL, "jev-1.13.0");
});

test("the paper is sent as title and abstract, and a missing abstract is marked", () => {
  assert.deepEqual(paperState(paper), { title: "Blood viscosity in Raynaud's disease", abstract: "(no abstract)" });
  assert.equal(paperState({ ...paper, abstract: "Some text." }).abstract, "Some text.");
});

test("step 1 asks one choice per measure and remembers which is which", () => {
  const { body, ids } = stage1Request(paper, ["Blood Viscosity", "Skin Temperature"]);
  assert.equal(body.model, MODEL);
  assert.deepEqual(body.state, paperState(paper));
  assert.deepEqual(ids, { m0: "Blood Viscosity", m1: "Skin Temperature" });
  assert.equal(body.questions.m0.type, "choice");
  assert.deepEqual(Object.keys(body.questions.m0.criteria), ["higher", "lower", "abnormal_unclear", "no_difference", "not_reported"]);
  assert.match(body.questions.m1.instructions, /Skin Temperature/);
  assert.match(body.questions.m1.criteria.higher, /Skin Temperature/);
});

test("step 2 asks one choice per measure-substance pair", () => {
  const pairs = [{ measure: "Blood Viscosity", substance: "Aspirin" }, { measure: "Platelet Aggregation", substance: "Aspirin" }];
  const { body, ids } = stage2Request(paper, pairs);
  assert.deepEqual(ids, { q0: pairs[0], q1: pairs[1] });
  assert.deepEqual(Object.keys(body.questions.q0.criteria), ["lowers", "raises", "no_effect", "not_reported"]);
  assert.match(body.questions.q1.instructions, /Aspirin/);
  assert.match(body.questions.q1.instructions, /Platelet Aggregation/);
});

// The leak guards: no question may connect Raynaud's and a substance (only the paper itself can)
test("step 2 questions never mention Raynaud's", () => {
  const { body } = stage2Request(paper, [{ measure: "Blood Viscosity", substance: "Aspirin" }]);
  assert.doesNotMatch(JSON.stringify(body.questions), /raynaud/i);
});

test("step 1 questions never mention a substance or fish oil", () => {
  const { body } = stage1Request(paper, ["Blood Viscosity"]);
  assert.doesNotMatch(JSON.stringify(body.questions), /fish|eicosapent|substance|drug/i);
});
