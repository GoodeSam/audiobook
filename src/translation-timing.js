/**
 * Accounting for where a translation run spends its wall-clock time.
 *
 * Added because "translation is very slow" has at least three causes that look
 * identical from outside — the sentence counter just advances slowly in all of
 * them — and each needs a different fix:
 *
 *   pacing     the fixed BATCH_INTERVAL_MS sleep between batches. Ours, and
 *              tunable, but lowering it trades directly against 429s.
 *   network    the round trip to the translation API. Not ours; a latency
 *              problem, fixable only by batching differently or moving traffic.
 *   rateLimit  429 backoff, which climbs to 5/15/30/60/90s. Reported as not
 *              firing here, but worth counting rather than assuming.
 *
 * Measuring first is the point: a plausible-looking cost centre in this same
 * translation path (one IndexedDB transaction per sentence for the cache) was
 * benchmarked in a real browser and came to ~170ms per 1000 sentences — far too
 * small to explain the complaint. This module exists so the next fix targets
 * something measured instead.
 */

const BUCKETS = ['network', 'pacing', 'rateLimit'];

/**
 * @returns {{recordBatch: Function, recordCache: Function, summary: Function, describe: Function}}
 */
export function createTimingRecorder() {
  let batches = 0;
  let sentences = 0;
  let cacheHits = 0;
  let cacheMisses = 0;
  const totals = { network: 0, pacing: 0, rateLimit: 0 };

  const num = (v) => (Number.isFinite(v) ? v : 0);

  return {
    /**
     * One completed batch.
     * @param {object} b
     * @param {number} [b.size] - Sentences in this batch.
     * @param {number} [b.networkMs] - Time in the API call, excluding 429 waits.
     * @param {number} [b.pacingMs] - Time spent in the deliberate inter-batch sleep.
     * @param {number} [b.rateLimitMs] - Time spent waiting out 429 backoff.
     */
    recordBatch({ size = 0, networkMs, pacingMs, rateLimitMs } = {}) {
      batches++;
      sentences += num(size);
      totals.network += num(networkMs);
      totals.pacing += num(pacingMs);
      totals.rateLimit += num(rateLimitMs);
    },

    /** Cache outcome for a group of sentences, before any of them are sent. */
    recordCache({ hits = 0, misses = 0 } = {}) {
      cacheHits += num(hits);
      cacheMisses += num(misses);
    },

    summary() {
      const totalMs = totals.network + totals.pacing + totals.rateLimit;
      const looked = cacheHits + cacheMisses;
      // `dominant` is the whole point: it names which of the three to attack.
      const dominant = totalMs > 0
        ? BUCKETS.reduce((a, b) => (totals[b] > totals[a] ? b : a))
        : null;
      return {
        batches,
        sentences,
        networkMs: totals.network,
        pacingMs: totals.pacing,
        rateLimitMs: totals.rateLimit,
        totalMs,
        dominant,
        avgNetworkMs: batches > 0 ? Math.round(totals.network / batches) : 0,
        msPerSentence: sentences > 0 ? Math.round(totalMs / sentences) : 0,
        cacheHits,
        cacheMisses,
        cacheHitRate: looked > 0 ? cacheHits / looked : 0,
      };
    },

    /** One line for a toast or a log — the shape of the run at a glance. */
    describe() {
      const s = this.summary();
      const secs = (ms) => (ms / 1000).toFixed(1);
      const label = { network: '网络往返', pacing: '批次间隔', rateLimit: '限流等待' };
      return `${s.batches} 批 / ${s.sentences} 句 · 共 ${secs(s.totalMs)}s`
        + `（网络 ${secs(s.networkMs)}s，间隔 ${secs(s.pacingMs)}s，限流 ${secs(s.rateLimitMs)}s）`
        + ` · 每句 ${s.msPerSentence}ms`
        + (s.dominant ? ` · 主要开销：${label[s.dominant]}` : '')
        + (s.cacheHits > 0 ? ` · 缓存命中 ${Math.round(s.cacheHitRate * 100)}%` : '');
    },
  };
}
