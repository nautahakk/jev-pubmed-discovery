import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMedline } from "../lib/medline.mjs";

// Trimmed from real PubMed records (MEDLINE text format), plus a title-only one
const TWO = `PMID- 2413982
OWN - NLM
DP  - 1985 Dec 15
TI  - Hypomagnesemia, renal dysfunction, and Raynaud's phenomenon in patients treated
      with cisplatin, vinblastine, and bleomycin.
AB  - Thirty men with metastatic germ cell cancer were treated with cisplatin (20 mg/m2
      administered intravenously, days 1-5).
RN  - 11056-06-7 (Bleomycin)
RN  - EC 2.7.3.2 (Creatine Kinase)
RN  - 0 (Interleukin-1 (IL-1))
RN  - PVB protocol
MH  - Adolescent
MH  - Nails/*blood supply
MH  - *Raynaud Disease/blood/chemically induced

PMID- 4089584
DP  - 1969 Dec-1970 Jan
TI  - [Indications for nailbed capillaroscopy in Raynaud's phenomenon].
MH  - Capillaries/pathology
`;

test("reads one record per PMID", () => {
  assert.deepEqual(parseMedline(TWO).map((r) => r.pmid), ["2413982", "4089584"]);
});

test("joins wrapped title and abstract lines with single spaces", () => {
  const [r] = parseMedline(TWO);
  assert.equal(r.title, "Hypomagnesemia, renal dysfunction, and Raynaud's phenomenon in patients treated with cisplatin, vinblastine, and bleomycin.");
  assert.equal(r.abstract, "Thirty men with metastatic germ cell cancer were treated with cisplatin (20 mg/m2 administered intravenously, days 1-5).");
});

test("takes the year from the publication date", () => {
  assert.deepEqual(parseMedline(TWO).map((r) => r.year), [1985, 1969]);
});

test("a record without an abstract gets an empty abstract", () => {
  assert.equal(parseMedline(TWO)[1].abstract, "");
});

test("MeSH headings keep their qualifiers and the major-topic star", () => {
  const { mesh } = parseMedline(TWO)[0];
  assert.deepEqual(mesh, [
    { name: "Adolescent", major: false, quals: [] },
    { name: "Nails", major: true, quals: ["blood supply"] },
    { name: "Raynaud Disease", major: true, quals: ["blood", "chemically induced"] },
  ]);
});

test("chemical names come from the RN field, with or without a registry number", () => {
  assert.deepEqual(parseMedline(TWO)[0].chems, ["Bleomycin", "Creatine Kinase", "Interleukin-1 (IL-1)", "PVB protocol"]);
});

test("Windows line endings parse the same", () => {
  assert.deepEqual(parseMedline(TWO.replace(/\n/g, "\r\n")), parseMedline(TWO));
});
