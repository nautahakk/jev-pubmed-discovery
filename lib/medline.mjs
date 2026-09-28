// Parses PubMed's MEDLINE text format (efetch rettype=medline): "TAG - value" lines,
// wrapped values continue on lines indented by 6 spaces, records start at "PMID-".

function meshHeading(value) {
  // "Nails/*blood supply": descriptor, then qualifiers; a star marks a major topic
  const parts = value.split("/");
  return {
    name: parts[0].replace(/^\*/, ""),
    major: parts.some((x) => x.startsWith("*")),
    quals: parts.slice(1).map((q) => q.replace(/^\*/, "")),
  };
}

function chemicalName(value) {
  // "EC 2.7.3.2 (Creatine Kinase)" or "0 (Interleukin-1 (IL-1))"; a few have no registry number
  const m = value.match(/^.*? \((.*)\)$/);
  return m ? m[1] : value;
}

function toRecord(fields) {
  const one = (tag) => fields.find((f) => f.tag === tag)?.value ?? "";
  const all = (tag) => fields.filter((f) => f.tag === tag).map((f) => f.value);
  return {
    pmid: one("PMID"),
    year: parseInt(one("DP").slice(0, 4), 10),
    title: one("TI"),
    abstract: one("AB"),
    mesh: all("MH").map(meshHeading),
    chems: all("RN").map(chemicalName),
  };
}

export function parseMedline(text) {
  const records = [];
  let fields = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const field = line.match(/^([A-Z]{2,4})\s*- (.*)$/);
    if (field) {
      if (field[1] === "PMID") {
        if (fields) records.push(toRecord(fields));
        fields = [];
      }
      fields?.push({ tag: field[1], value: field[2].trim() });
    } else if (fields?.length && /^ {6}\S/.test(line)) {
      const last = fields[fields.length - 1];
      last.value += " " + line.trim();
    }
  }
  if (fields) records.push(toRecord(fields));
  return records;
}
