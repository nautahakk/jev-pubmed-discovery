// Candidate scoring rules for the hidden-years test (see BENCHMARK.md). None of them names a
// disease, drug or measure: they only use MeSH's own tree structure and paper counts.

const CATEGORY = ["D27"]; // Chemical Actions and Uses: labels like "Vasodilator Agents", not drugs
const TARGET = ["D08.811", "D12.776.543.750", "D12.776.826", "D12.776.827"]; // enzymes, receptors

// "candidate" = something a person could take; the others go to a separate list, not the bin
export function classifySubstance(treeNumbers = []) {
  if (treeNumbers.some((tn) => CATEGORY.some((p) => tn.startsWith(p)))) return "category";
  if (treeNumbers.some((tn) => TARGET.some((p) => tn.startsWith(p)))) return "target";
  return "candidate";
}

// Bridges in the same MeSH branch (first two levels, e.g. G09.330) share one point between them
export function overlapWeights(bridges, treesOf) {
  const branch = (b) => (treesOf[b] ?? []).filter((tn) => tn.startsWith("G")).sort()[0]?.slice(0, 7) ?? b;
  const size = {};
  for (const b of bridges) size[branch(b)] = (size[branch(b)] ?? 0) + 1;
  return Object.fromEntries(bridges.map((b) => [b, 1 / size[branch(b)]]));
}

// A link through a rare, specific measure says more than one through a measure everyone studies
export function specificityWeights(sizes, total) {
  return Object.fromEntries(Object.entries(sizes).map(([b, n]) => [b, Math.log10(total / n)]));
}

const byScore = (a, b) => b.score - a.score || b.support - a.support || a.substance.localeCompare(b.substance);

export function rankWeighted(evidence, { weights, classOf = () => "candidate", isKnown = () => false, minSupport = 1 }) {
  const ranked = [], known = [], targets = [];
  for (const [substance, perBridge] of Object.entries(evidence)) {
    const counted = Object.entries(perBridge)
      .filter(([b, e]) => b in weights && e.support.length >= minSupport && e.support.length > e.against.length)
      .map(([b]) => b)
      .sort();
    if (!counted.length) continue;
    const row = {
      substance,
      score: counted.reduce((s, b) => s + weights[b], 0),
      support: counted.reduce((n, b) => n + perBridge[b].support.length, 0),
      bridges: counted,
    };
    if (isKnown(substance)) known.push(row);
    else if (classOf(substance) !== "candidate") targets.push(row);
    else ranked.push(row);
  }
  return { ranked: ranked.sort(byScore), known: known.sort(byScore), targets: targets.sort(byScore) };
}
