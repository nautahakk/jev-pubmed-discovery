// Live progress for a running step, fed the JSONL rows as they are appended.
import { PRICE_PER_MTOK } from "./price.mjs";

const WINDOW_MS = 60000;

export function lineReader() {
  let rest = "";
  return (chunk) => {
    const lines = (rest + chunk).split("\n");
    rest = lines.pop();
    return lines.filter((l) => l.trim()).map((l) => JSON.parse(l));
  };
}

export function tracker({ total, charsOf = () => 0, startedAt = null }) {
  const s = { done: 0, questions: 0, tokens: 0, chars: 0, answers: {} };
  const samples = []; // [time, done]
  return {
    add(rows, now) {
      for (const r of rows) {
        s.done++;
        s.questions += Object.keys(r.ids).length;
        s.tokens += r.usage?.input_tokens ?? 0;
        s.chars += charsOf(r.pmid);
        for (const a of Object.values(r.answers)) s.answers[a.choice] = (s.answers[a.choice] ?? 0) + 1;
      }
      samples.push([now, s.done]);
      // keep one sample older than the window so the speed always spans a full minute
      while (samples.length > 2 && samples[1][0] <= now - WINDOW_MS) samples.shift();
    },
    snapshot(now) {
      let perMinute = 0;
      const [t0, d0] = samples[0] ?? [now, 0];
      if (now - t0 >= WINDOW_MS) perMinute = ((s.done - d0) / (now - t0)) * 60000;
      else if (startedAt !== null && now > startedAt) perMinute = (s.done / (now - startedAt)) * 60000;
      const minutesLeft = perMinute > 0 ? (total - s.done) / perMinute : null;
      return { ...s, answers: { ...s.answers }, total, perMinute, minutesLeft, cost: (s.tokens / 1e6) * PRICE_PER_MTOK };
    },
  };
}
