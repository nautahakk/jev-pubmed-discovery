// The hidden-years test: drugs first tried for a disease after the cutoff are the answers
// the method has to find using only papers from before it.
import { shuffle } from "./pubmed.mjs";

// How many papers study each substance as a treatment for the disease, by PubMed's own tags
export function treatmentCounts(records, disease) {
  const counts = new Map();
  for (const r of records) {
    const d = r.mesh.find((m) => m.name === disease);
    if (!d?.quals.includes("drug therapy")) continue;
    for (const m of r.mesh) {
      if (m.name !== disease && m.quals.includes("therapeutic use")) counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
    }
  }
  return counts;
}

export function hiddenAnswers(counts, { isKnown, isExcluded = () => false, minPapers = 2 }) {
  return [...counts]
    .filter(([s, n]) => n >= minPapers && !isKnown(s) && !isExcluded(s))
    .map(([substance, papers]) => ({ substance, papers }))
    .sort((a, b) => b.papers - a.papers || a.substance.localeCompare(b.substance));
}

// "Glaucoma, Angle-Closure" → "Angle-Closure Glaucoma", so questions read like normal English
export function naturalName(label) {
  const parts = label.split(", ");
  return parts.length === 1 ? label : [...parts.slice(1).reverse(), parts[0]].join(" ");
}

// How a ranking did against the hidden answers, next to what a random order of the same list would do
export function hitMetrics(ranked, answers) {
  const position = new Map(ranked.map((r, i) => [r.substance, i + 1]));
  const ranks = Object.fromEntries(answers.map((a) => [a, position.get(a) ?? null]));
  const found = Object.values(ranks).filter((r) => r !== null);
  const n = ranked.length, k = found.length;
  let noneInTop10 = 1;
  for (let i = 0; i < Math.min(10, n); i++) noneInTop10 *= (n - k - i) / (n - i);
  return {
    anyInTop10: found.some((r) => r <= 10),
    shareInTop50: found.filter((r) => r <= 50).length / answers.length,
    ranks,
    chanceTop10: k ? 1 - Math.max(noneInTop10, 0) : 0,
    chanceTop50: n ? (Math.min(50, n) / n) * (k / answers.length) : 0,
  };
}

export function splitCases(cases, seed) {
  const order = shuffle(cases, seed);
  const half = Math.ceil(order.length / 2);
  return { practice: order.slice(0, half), exam: order.slice(half) };
}
