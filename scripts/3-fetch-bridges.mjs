// Step 2a: the papers about each bridge measure, published 1985 or earlier.
import { allIds, fetchRecords, sampleIds } from "../lib/pubmed.mjs";
import { CUTOFF, BRIDGE_CAP, SEED, readJson, writeJson, writeLines } from "./common.mjs";

const bridges = readJson("bridges.json");
const membership = new Map(); // pmid -> the bridges it's used for
const sizes = [];
for (const b of bridges) {
  const all = await allIds(`"${b.measure}"[mh:noexp]`, 1800, CUTOFF);
  const used = sampleIds(all, BRIDGE_CAP, SEED);
  sizes.push({ measure: b.measure, papers: all.length, used: used.length });
  for (const id of used) (membership.get(id) ?? membership.set(id, []).get(id)).push(b.measure);
  console.log(`  ${b.measure}: ${all.length} papers${all.length > used.length ? `, sampled ${used.length}` : ""}`);
}
writeJson("bridge-sizes.json", sizes);

const idList = [...membership.keys()];
console.log(`${idList.length} different bridge papers, fetching…`);
const records = await fetchRecords(idList, { onBatch: (n, total) => process.stdout.write(`\r  fetched ${n}/${total}`) });
console.log();
const kept = records
  .filter((r) => r.year <= CUTOFF)
  .map((r) => ({ pmid: r.pmid, year: r.year, title: r.title, abstract: r.abstract, chems: [...new Set(r.chems)], mesh: r.mesh.map((m) => m.name), bridges: membership.get(r.pmid) ?? [] }));
writeLines("bridge-papers.jsonl", kept);
console.log(`kept ${kept.length} of ${records.length} (${records.length - kept.length} dropped for a later date); ${kept.filter((r) => r.chems.length).length} list at least one chemical`);
