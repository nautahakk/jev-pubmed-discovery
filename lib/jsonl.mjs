// One JSON object per line, appended as each answer arrives, so a long run can resume after a crash.
import { appendFileSync, existsSync, readFileSync } from "node:fs";

export function readJsonl(path) {
  if (!existsSync(path)) return [];
  const rows = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // a half-written last line from a crash; its paper is simply asked again
    }
  }
  return rows;
}

export function appendJsonl(path, row) {
  appendFileSync(path, JSON.stringify(row) + "\n");
}
