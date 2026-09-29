// Prep: re-fetches the MeSH headings WITH qualifiers for the fish-oil run's bridge papers
// (the run itself only kept heading names). Free: PubMed only.
import { readJsonl } from "../../lib/jsonl.mjs";
import { fetchRecords } from "../../lib/pubmed.mjs";
import { file, writeLines } from "../common.mjs";

const ids = readJsonl(file("bridge-papers.jsonl")).map((p) => p.pmid);
const records = await fetchRecords(ids, { onBatch: (n, total) => process.stdout.write(`\r  fetched ${n}/${total}`) });
writeLines("bridge-mesh.jsonl", records.map((r) => ({ pmid: r.pmid, mesh: r.mesh.map(({ name, quals }) => ({ name, quals })) })));
console.log(`\nsaved MeSH with qualifiers for ${records.length} papers`);
