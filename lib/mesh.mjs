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

// Which labels (descriptors or supplementary concepts) have at least one pharmacological action in MeSH
export function drugActionQuery(labels) {
  return `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX meshv: <http://id.nlm.nih.gov/mesh/vocab#>
SELECT DISTINCT ?label FROM <http://id.nlm.nih.gov/mesh> WHERE {
  ?d rdfs:label ?label ; meshv:pharmacologicalAction ?pa .
  VALUES ?label { ${labels.map(literal).join(" ")} }
}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One SPARQL call, retried on server errors and on connections that drop mid-download
export async function sparql(query, { fetchImpl = fetch, sleepImpl = sleep, tries = 4, offset = 0 } = {}) {
  const url = new URL(SPARQL);
  url.searchParams.set("query", query);
  url.searchParams.set("format", "JSON");
  url.searchParams.set("limit", "1000");
  if (offset) url.searchParams.set("offset", String(offset));
  for (let attempt = 1; ; attempt++) {
    let fatal = null;
    try {
      const res = await fetchImpl(url);
      if (res.ok) return await res.json();
      if (res.status < 500 && res.status !== 429) fatal = new Error(`MeSH SPARQL returned ${res.status}`);
      else if (attempt >= tries) fatal = new Error(`MeSH SPARQL returned ${res.status} after ${tries} tries`);
    } catch (err) {
      if (attempt >= tries) throw err;
    }
    if (fatal) throw fatal;
    await sleepImpl(2000 * attempt);
  }
}

export async function lookupDrugActions(labels, { batch = 80, ...options } = {}) {
  const found = new Set();
  for (let i = 0; i < labels.length; i += batch) {
    const json = await sparql(drugActionQuery(labels.slice(i, i + batch)), options);
    for (const b of json.results.bindings) found.add(b.label.value);
  }
  return found;
}

export function parseTrees(json) {
  const out = {};
  for (const b of json.results.bindings) (out[b.label.value] ??= new Set()).add(b.tn.value);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]));
}

export async function lookupTrees(labels, { batch = 80, ...options } = {}) {
  const out = {};
  for (let i = 0; i < labels.length; i += batch) {
    Object.assign(out, parseTrees(await sparql(treeQuery(labels.slice(i, i + batch)), options)));
  }
  return out;
}
