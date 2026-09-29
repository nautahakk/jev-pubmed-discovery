// Shared by the hidden-years runner and scorer.
import { wasGiven } from "../../lib/filters.mjs";

export const caseDir = (disease) => `bench/${disease.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
export const cacheKey = (pmid, { substance, measure }) => `${pmid}|${substance}|${measure}`;

// The reading plan: ask only when the substance was given, can't be judged, or the measure is tagged "drug effects"
export function keepPair(paper, { substance, measure }) {
  return wasGiven(paper.mesh, substance) !== false
    || paper.mesh.some((h) => h.name === measure && h.quals.includes("drug effects"));
}
