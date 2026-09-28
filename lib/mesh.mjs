// MeSH tree numbers from NLM's MeSH SPARQL service, and the protocol's "body process" filter.
export const SPARQL = "https://id.nlm.nih.gov/mesh/sparql";

// Body-physiology branches of the Phenomena and Processes tree (see PROTOCOL.md)
export const BODY_BRANCHES = ["G03", "G04", "G07", "G08", "G09", "G10", "G11", "G12", "G13", "G14"];

export function isBodyProcess(treeNumbers = []) {
  return treeNumbers.some((tn) => BODY_BRANCHES.includes(tn.slice(0, 3)));
}

const literal = (s) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"@en`;

export function treeQuery(labels) {
  return `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX meshv: <http://id.nlm.nih.gov/mesh/vocab#>
SELECT ?label ?tn FROM <http://id.nlm.nih.gov/mesh> WHERE {
  ?d a meshv:TopicalDescriptor ; rdfs:label ?label ; meshv:treeNumber ?t .
  ?t rdfs:label ?tn .
  VALUES ?label { ${labels.map(literal).join(" ")} }
}`;
}

export function parseTrees(json) {
  const out = {};
  for (const b of json.results.bindings) (out[b.label.value] ??= new Set()).add(b.tn.value);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]));
}

export async function lookupTrees(labels, { fetchImpl = fetch, batch = 80 } = {}) {
  const out = {};
  for (let i = 0; i < labels.length; i += batch) {
    const url = new URL(SPARQL);
    url.searchParams.set("query", treeQuery(labels.slice(i, i + batch)));
    url.searchParams.set("format", "JSON");
    url.searchParams.set("limit", "1000");
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`MeSH SPARQL returned ${res.status}`);
    Object.assign(out, parseTrees(await res.json()));
  }
  return out;
}
