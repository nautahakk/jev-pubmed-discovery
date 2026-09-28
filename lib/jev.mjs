// Client for TypeSafe's System One endpoint (the Jev model). Docs: https://docs.typesafe.ai/api
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function systemOne({ apiKey, body, fetchImpl = fetch, sleepImpl = sleep, retries = 6, timeoutMs = 60000 }) {
  for (let attempt = 0; ; attempt++) {
    let res, error;
    try {
      res = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      error = err;
    }
    if (res?.ok) {
      const json = await res.json();
      return { answers: json.answers, usage: json.usage, model: json.model };
    }
    // 429 = rate limit, 529 = overloaded, other 5xx and network errors are usually brief too
    const retryable = !res || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      const detail = res ? `Jev returned ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}` : `Jev request failed: ${error.message}`;
      throw new Error(detail);
    }
    const retryAfter = Number(res?.headers?.get("retry-after"));
    await sleepImpl(retryAfter > 0 ? retryAfter * 1000 : Math.min(30000, 500 * 2 ** attempt));
  }
}
