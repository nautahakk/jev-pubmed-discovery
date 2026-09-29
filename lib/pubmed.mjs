// PubMed E-utilities: counts, ids and MEDLINE records. No API key, so at most 3 requests a second.
import { parseMedline } from "./medline.mjs";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";
const MAX_IDS = 9999; // esearch won't return more ids than this for one query
const GAP_MS = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;

// Returns the response text. The body is read inside the retry loop, because big downloads can drop
// halfway through ("terminated") after the status line already said 200.
export async function eutils(path, params, { method = "GET", tries = 5, fetchImpl = fetch, sleepImpl = sleep } = {}) {
  const body = new URLSearchParams({ db: "pubmed", tool: "jev-discovery", ...params });
  for (let attempt = 1; ; attempt++) {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await sleepImpl(wait);
    lastCall = Date.now();
    let fatal = null;
    try {
      const res = method === "POST"
        ? await fetchImpl(EUTILS + path, { method, body, signal: AbortSignal.timeout(180000) })
        : await fetchImpl(`${EUTILS}${path}?${body}`, { signal: AbortSignal.timeout(180000) });
      if (res.ok) return await res.text();
      if (res.status < 500 && res.status !== 429 && res.status !== 408) fatal = new Error(`PubMed ${path} returned ${res.status}`);
      else if (attempt >= tries) fatal = new Error(`PubMed ${path} returned ${res.status} after ${tries} tries`);
    } catch (err) {
      if (attempt >= tries) throw err;
    }
    if (fatal) throw fatal;
    await sleepImpl(2000 * attempt);
  }
}

export async function count(term) {
  return Number(JSON.parse(await eutils("esearch.fcgi", { term, rettype: "count", retmode: "json" })).esearchresult.count);
}

export async function ids(term) {
  const r = JSON.parse(await eutils("esearch.fcgi", { term, retmax: String(MAX_IDS), retmode: "json" })).esearchresult;
  if (Number(r.count) > MAX_IDS) throw new Error(`"${term}" has ${r.count} results; split it first`);
  return r.idlist;
}

// Splits [lo, hi] into year ranges that each have at most `max` results
export async function splitYears(countRange, lo, hi, max = MAX_IDS) {
  const n = await countRange(lo, hi);
  if (n <= max) return [[lo, hi]];
  if (lo === hi) throw new Error(`${lo} alone has ${n} results, over the ${max} limit`);
  const mid = Math.floor((lo + hi) / 2);
  return [...(await splitYears(countRange, lo, mid, max)), ...(await splitYears(countRange, mid + 1, hi, max))];
}

// Every id for a term published between lo and hi, however many there are
export async function allIds(term, lo = 1800, hi = 1985) {
  const withYears = (a, b) => `(${term}) AND ${a}:${b}[dp]`;
  const ranges = await splitYears((a, b) => count(withYears(a, b)), lo, hi);
  const out = [];
  for (const [a, b] of ranges) out.push(...(await ids(withYears(a, b))));
  return [...new Set(out)];
}

export async function fetchRecords(idList, { batch = 400, onBatch } = {}) {
  const out = [];
  for (let i = 0; i < idList.length; i += batch) {
    const text = await eutils("efetch.fcgi", { id: idList.slice(i, i + batch).join(","), rettype: "medline", retmode: "text" }, { method: "POST" });
    out.push(...parseMedline(text));
    onBatch?.(Math.min(i + batch, idList.length), idList.length);
  }
  return out;
}

// Seeded shuffle (mulberry32), so a capped sample is the same on every run
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, seed) {
  const rnd = random(seed);
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sampleIds(idList, n, seed) {
  if (idList.length <= n) return [...idList];
  return shuffle(idList, seed).slice(0, n);
}
