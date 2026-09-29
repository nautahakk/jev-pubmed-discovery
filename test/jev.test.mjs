import { test } from "node:test";
import assert from "node:assert/strict";
import { systemOne, OutOfCredits } from "../lib/jev.mjs";

const reply = (status, body = {}, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
});
const OK = { model: "jev-1.13.0", answers: { q0: { type: "choice", choice: "lowers" } }, usage: { input_tokens: 300, output_tokens: 20 } };
const noSleep = async () => {};

test("returns the answers, the token usage and the model that answered", async () => {
  const res = await systemOne({ apiKey: "k", body: {}, fetchImpl: async () => reply(200, OK), sleepImpl: noSleep });
  assert.deepEqual(res, { answers: OK.answers, usage: OK.usage, model: "jev-1.13.0" });
});

test("retries on rate limits, overload and network errors, then succeeds", async () => {
  const script = [() => reply(429), () => reply(529), () => { throw new Error("socket hang up"); }, () => reply(200, OK)];
  let calls = 0;
  const res = await systemOne({ apiKey: "k", body: {}, fetchImpl: async () => script[calls++](), sleepImpl: noSleep });
  assert.equal(calls, 4);
  assert.equal(res.model, "jev-1.13.0");
});

test("waits as long as the retry-after header says", async () => {
  const waits = [];
  let calls = 0;
  await systemOne({
    apiKey: "k", body: {},
    fetchImpl: async () => (calls++ === 0 ? reply(429, {}, { "retry-after": "3" }) : reply(200, OK)),
    sleepImpl: async (ms) => { waits.push(ms); },
  });
  assert.deepEqual(waits, [3000]);
});

test("doesn't retry a request Jev rejects as invalid", async () => {
  let calls = 0;
  await assert.rejects(
    systemOne({ apiKey: "k", body: {}, fetchImpl: async () => { calls++; return reply(422, { detail: "bad question" }); }, sleepImpl: noSleep }),
    /422/,
  );
  assert.equal(calls, 1);
});

test("an empty credit balance (402) is reported as out of credits, without retrying", async () => {
  let calls = 0;
  await assert.rejects(
    systemOne({ apiKey: "k", body: {}, fetchImpl: async () => { calls++; return reply(402, { detail: "Payment required" }); }, sleepImpl: noSleep }),
    OutOfCredits,
  );
  assert.equal(calls, 1);
});

test("a refusal that talks about the credit balance is out of credits too", async () => {
  await assert.rejects(
    systemOne({ apiKey: "k", body: {}, fetchImpl: async () => reply(403, { detail: "Insufficient credit balance" }), sleepImpl: noSleep }),
    OutOfCredits,
  );
});

test("other refusals stay ordinary errors", async () => {
  await assert.rejects(
    systemOne({ apiKey: "k", body: {}, fetchImpl: async () => reply(422, { detail: "bad question" }), sleepImpl: noSleep }),
    (err) => !(err instanceof OutOfCredits) && /422/.test(err.message),
  );
});

test("gives up after the retry limit", async () => {
  let calls = 0;
  await assert.rejects(
    systemOne({ apiKey: "k", body: {}, retries: 2, fetchImpl: async () => { calls++; return reply(529); }, sleepImpl: noSleep }),
    /529/,
  );
  assert.equal(calls, 3);
});
