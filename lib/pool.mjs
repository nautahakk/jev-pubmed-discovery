// Runs work with a cap on how many are in flight and on how many start per minute.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runPool(items, worker, { concurrency = 8, rpm = Infinity } = {}) {
  const gap = Number.isFinite(rpm) ? 60000 / rpm : 0;
  const results = new Array(items.length);
  let next = 0;
  let lastSlot = -Infinity;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      const slot = Math.max(Date.now(), lastSlot + gap);
      lastSlot = slot;
      const wait = slot - Date.now();
      if (wait > 0) await sleep(wait);
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return results;
}
