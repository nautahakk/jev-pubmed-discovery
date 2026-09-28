// Everything after Jev's answers is plain counting, as PROTOCOL.md says.
export const VOTE = 0.5;
const STAGE1_OPTIONS = ["higher", "lower", "abnormal_unclear", "no_difference", "not_reported"];

export function stage1Votes(rows) {
  const votes = {};
  for (const row of rows) {
    for (const [qid, measure] of Object.entries(row.ids)) {
      const probs = row.answers[qid]?.probabilities ?? {};
      const v = (votes[measure] ??= {
        counts: Object.fromEntries(STAGE1_OPTIONS.map((o) => [o, 0])),
        papers: 0,
        pmids: { higher: [], lower: [] },
      });
      v.papers++;
      for (const opt of STAGE1_OPTIONS) {
        if ((probs[opt] ?? 0) < VOTE) continue;
        v.counts[opt]++;
        if (opt in v.pmids) v.pmids[opt].push(row.pmid);
      }
    }
  }
  return votes;
}

export function selectBridges(votes, { minVotes = 2 } = {}) {
  const bridges = [];
  for (const [measure, v] of Object.entries(votes)) {
    const { higher, lower, no_difference } = v.counts;
    const direction = higher > lower ? "higher" : lower > higher ? "lower" : null;
    if (!direction) continue;
    const n = Math.max(higher, lower);
    if (n < minVotes || n <= no_difference) continue;
    bridges.push({ measure, direction, votes: n, opposite: Math.min(higher, lower), noDifference: no_difference, papers: v.papers });
  }
  return bridges.sort((a, b) => b.votes - a.votes || a.measure.localeCompare(b.measure));
}

export function linkEvidence(rows, bridges) {
  const direction = new Map(bridges.map((b) => [b.measure, b.direction]));
  const evidence = {};
  for (const row of rows) {
    for (const [qid, { measure, substance }] of Object.entries(row.ids)) {
      if (!direction.has(measure)) continue;
      const helpful = direction.get(measure) === "higher" ? "lowers" : "raises";
      const harmful = helpful === "lowers" ? "raises" : "lowers";
      const probs = row.answers[qid]?.probabilities ?? {};
      const e = ((evidence[substance] ??= {})[measure] ??= { support: [], against: [], asked: 0 });
      e.asked++;
      if ((probs[helpful] ?? 0) >= VOTE) e.support.push(row.pmid);
      else if ((probs[harmful] ?? 0) >= VOTE) e.against.push(row.pmid);
    }
  }
  return evidence;
}

const byScore = (a, b) => b.points - a.points || b.support - a.support || a.substance.localeCompare(b.substance);

export function rankSubstances(evidence, { isKnown = () => false, minSupport = 1 } = {}) {
  const ranked = [], known = [];
  for (const [substance, perBridge] of Object.entries(evidence)) {
    const counted = Object.entries(perBridge)
      .filter(([, e]) => e.support.length >= minSupport && e.support.length > e.against.length)
      .map(([measure]) => measure)
      .sort();
    if (!counted.length) continue;
    const support = counted.reduce((n, m) => n + perBridge[m].support.length, 0);
    (isKnown(substance) ? known : ranked).push({ substance, points: counted.length, support, bridges: counted });
  }
  return { ranked: ranked.sort(byScore), known: known.sort(byScore) };
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function knownChecker(records) {
  const indexed = new Set();
  for (const r of records) {
    for (const m of r.mesh) indexed.add(m.name.toLowerCase());
    for (const c of r.chems) indexed.add(c.toLowerCase());
  }
  const text = records.map((r) => `${r.title} ${r.abstract}`).join("\n").toLowerCase();
  const cache = new Map();
  return (name) => {
    const key = name.toLowerCase();
    if (indexed.has(key)) return true;
    if (!cache.has(key)) {
      const start = /^\w/.test(key) ? "\\b" : "";
      const end = /\w$/.test(key) ? "\\b" : "";
      cache.set(key, new RegExp(start + escape(key) + end).test(text));
    }
    return cache.get(key);
  };
}

export const FISH_OIL = /fish oil|cod liver oil|eicosapentaen|icosapent|docosahexaen|omega-3|n-3 fatty|marine oil|menhaden/i;
export const isFishOil = (name) => FISH_OIL.test(name);

export function rankOf(list, predicate) {
  const i = list.findIndex(predicate);
  return i === -1 ? null : i + 1;
}

export function baselineRank(papers, bridges, { isKnown = () => false } = {}) {
  const isBridge = new Set(bridges.map((b) => b.measure));
  const seen = {};
  for (const paper of papers) {
    const onPaper = paper.bridges.filter((m) => isBridge.has(m));
    if (!onPaper.length) continue;
    for (const s of new Set(paper.chems)) {
      const e = (seen[s] ??= { bridges: new Set(), papers: 0 });
      onPaper.forEach((m) => e.bridges.add(m));
      e.papers++;
    }
  }
  const ranked = [], known = [];
  for (const [substance, e] of Object.entries(seen)) {
    const row = { substance, points: e.bridges.size, papers: e.papers, bridges: [...e.bridges].sort() };
    (isKnown(substance) ? known : ranked).push(row);
  }
  const order = (a, b) => b.points - a.points || b.papers - a.papers || a.substance.localeCompare(b.substance);
  return { ranked: ranked.sort(order), known: known.sort(order) };
}
