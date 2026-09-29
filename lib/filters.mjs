// Cheaper reading: only ask Jev about substances PubMed's indexers say were actually given in a study.

// MeSH qualifiers that mean the substance was given, applied or dosed (not just measured)
export const GIVEN_QUALIFIERS = new Set([
  "pharmacology", "therapeutic use", "administration & dosage", "adverse effects",
  "toxicity", "poisoning", "pharmacokinetics",
]);

// true = given, false = only measured or used some other way, null = no heading of its own to judge by
export function wasGiven(mesh, substance) {
  const heading = mesh.find((m) => m.name === substance);
  if (!heading) return null;
  return heading.quals.some((q) => GIVEN_QUALIFIERS.has(q));
}

export function keepQuestions(rows, keep) {
  const out = [];
  for (const row of rows) {
    const ids = {}, answers = {};
    for (const [qid, pair] of Object.entries(row.ids)) {
      if (!keep(row.pmid, pair)) continue;
      ids[qid] = pair;
      answers[qid] = row.answers[qid];
    }
    if (Object.keys(ids).length) out.push({ ...row, ids, answers });
  }
  return out;
}
