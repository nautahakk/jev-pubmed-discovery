// Step 1a: every Raynaud's paper published 1985 or earlier.
import { allIds, fetchRecords } from "../lib/pubmed.mjs";
import { isFishOil } from "../lib/score.mjs";
import { CUTOFF, RAYNAUD_TERM, writeLines } from "./common.mjs";

const idList = await allIds(RAYNAUD_TERM, 1800, CUTOFF);
console.log(`Raynaud papers up to ${CUTOFF}: ${idList.length}`);
const records = await fetchRecords(idList, { onBatch: (n, total) => process.stdout.write(`\r  fetched ${n}/${total}`) });
console.log();

const kept = records.filter((r) => r.year <= CUTOFF);
const dropped = records.filter((r) => !(r.year <= CUTOFF));
writeLines("raynaud.jsonl", kept);
console.log(`kept ${kept.length} of ${records.length} records${dropped.length ? `; dropped (date after ${CUTOFF} or unreadable): ${dropped.map((r) => `${r.pmid}/${r.year}`).join(", ")}` : ""}`);
console.log(`with an abstract: ${kept.filter((r) => r.abstract).length}`);

// The test is only fair if no Raynaud paper from before 1986 already mentions fish oil
const fish = kept.filter((r) => isFishOil(`${r.title} ${r.abstract}`) || r.mesh.some((m) => isFishOil(m.name)) || r.chems.some(isFishOil));
console.log(`Raynaud papers that mention fish oil (should be 0): ${fish.length}${fish.length ? ` (${fish.map((r) => r.pmid).join(", ")})` : ""}`);
