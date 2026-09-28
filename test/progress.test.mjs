import { test } from "node:test";
import assert from "node:assert/strict";
import { lineReader, tracker } from "../lib/progress.mjs";

test("the line reader returns whole rows and holds a half-written one until the rest arrives", () => {
  const read = lineReader();
  assert.deepEqual(read('{"a":1}\n{"a":'), [{ a: 1 }]);
  assert.deepEqual(read('2}\n'), [{ a: 2 }]);
});

const row = (pmid, choices, tokens = 1000) => ({
  pmid,
  ids: Object.fromEntries(choices.map((_, i) => [`q${i}`, { measure: "M", substance: "S" }])),
  answers: Object.fromEntries(choices.map((c, i) => [`q${i}`, { choice: c }])),
  usage: { input_tokens: tokens },
});

test("counts papers, questions, tokens, characters of paper text and the answer mix", () => {
  const t = tracker({ total: 10, charsOf: (pmid) => (pmid === "1" ? 300 : 200) });
  t.add([row("1", ["lowers", "not_reported"]), row("2", ["raises"])], 0);
  const s = t.snapshot(0);
  assert.equal(s.done, 2);
  assert.equal(s.questions, 3);
  assert.equal(s.tokens, 2000);
  assert.equal(s.chars, 500);
  assert.deepEqual(s.answers, { lowers: 1, not_reported: 1, raises: 1 });
  assert.equal(s.cost, (2000 / 1e6) * 0.042);
});

test("speed is measured over the last minute and gives the time left", () => {
  const t = tracker({ total: 1900 });
  t.add(Array.from({ length: 100 }, (_, i) => row(String(i), ["not_reported"])), 0);
  t.add(Array.from({ length: 900 }, (_, i) => row(String(100 + i), ["not_reported"])), 60000);
  const s = t.snapshot(60000);
  assert.equal(s.perMinute, 900);
  assert.equal(s.minutesLeft, 1);
});

test("before a minute of samples exists, speed falls back to the average since the run started", () => {
  const t = tracker({ total: 1000, startedAt: 0 });
  t.add(Array.from({ length: 300 }, (_, i) => row(String(i), ["not_reported"])), 120000);
  assert.equal(t.snapshot(120000).perMinute, 150);
});
