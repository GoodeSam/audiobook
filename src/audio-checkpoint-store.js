/**
 * Audio checkpoint persistence policy.
 *
 * Decides WHEN a partially-generated chapter is written to storage, and
 * WHETHER a stored checkpoint may be resumed from. The storage calls
 * themselves are injected so this stays testable without IndexedDB.
 *
 * Background: resume was half-implemented. generateChapterAudio accepted
 * `startIndex` / `existingBlobs`, but the checkpoints feeding them lived only
 * in `state.audioCheckpoints` — a plain in-memory object. A reload, a tab
 * discard, or simply going back to the shelf and reopening the book wiped
 * every synthesized segment, so generation always restarted from zero.
 */

/** Segments between checkpoint writes. Small enough to bound rework, large
 *  enough that IndexedDB writes don't dominate synthesis time. */
export const DEFAULT_FLUSH_EVERY = 20;

/**
 * Should progress be written to storage at this point?
 *
 * @param {object} args
 * @param {number} args.completedIndex - Segments finished so far.
 * @param {number} args.totalSegments - Segments in the whole chapter.
 * @param {number} args.lastFlushed - completedIndex at the previous write.
 * @param {number} [args.flushEvery]
 * @returns {boolean}
 */
export function shouldFlushCheckpoint({
  completedIndex,
  totalSegments,
  lastFlushed = 0,
  flushEvery = DEFAULT_FLUSH_EVERY,
}) {
  if (completedIndex <= 0) return false;
  if (completedIndex <= lastFlushed) return false;
  // The last segment always gets written — otherwise a chapter that ends
  // between intervals leaves its tail unrecoverable.
  if (completedIndex >= totalSegments) return true;
  // `>=` rather than a modulo test: a resume can start mid-interval and never
  // land on an exact multiple.
  return completedIndex - lastFlushed >= flushEvery;
}

/**
 * Is this stored checkpoint safe to resume from?
 *
 * Every rejection here corresponds to a way a resume could silently produce
 * corrupt audio rather than obviously failing.
 *
 * @param {object|null} checkpoint
 * @param {object} expected - { audioMode, totalSegments }
 * @returns {boolean}
 */
export function isResumable(checkpoint, { audioMode, totalSegments }) {
  if (!checkpoint) return false;

  // Recorded mode is required. A checkpoint written before modes were tracked
  // cannot be proven compatible, and guessing splices two different segment
  // lists together.
  if (!checkpoint.audioMode) return false;
  if (checkpoint.audioMode !== audioMode) return false;

  // Segment count changing means the chapter text or its translation changed,
  // so the stored blobs no longer line up with the new segment list.
  if (checkpoint.totalSegments !== totalSegments) return false;

  const { completedIndex, audioBlobs } = checkpoint;
  if (!Number.isInteger(completedIndex) || completedIndex <= 0) return false;
  if (completedIndex > totalSegments) return false;

  // Fingerprint of the array-aliasing bug: progress claimed, blobs gone.
  if (!Array.isArray(audioBlobs) || audioBlobs.length !== completedIndex) return false;

  return true;
}

/**
 * Turn a stored checkpoint into generateChapterAudio's resume arguments,
 * falling back to a clean start whenever the checkpoint cannot be trusted.
 *
 * @param {object|null} checkpoint
 * @param {object} expected - { audioMode, totalSegments }
 * @returns {{resuming: boolean, startIndex: number, existingBlobs: Blob[]}}
 */
export function resumePlan(checkpoint, expected) {
  if (!isResumable(checkpoint, expected)) {
    return { resuming: false, startIndex: 0, existingBlobs: [] };
  }
  return {
    resuming: true,
    startIndex: checkpoint.completedIndex,
    // Copy: the caller must not be able to mutate the stored checkpoint.
    existingBlobs: [...checkpoint.audioBlobs],
  };
}

/**
 * Throttled writer for in-progress chapter audio.
 *
 * @param {object} options
 * @param {Function} options.save - (checkpoint) => Promise<void>
 * @param {Function} options.remove - () => Promise<void>, called on completion.
 * @param {number} [options.flushEvery]
 * @param {number} [options.maxFailures] - Give up persisting after this many
 *   consecutive storage errors (a full quota will not recover mid-chapter, and
 *   retrying every interval just burns time).
 * @param {Function} [options.onError] - Notified on each storage failure.
 * @returns {{record: Function, done: Function, persistedAny: Function, failed: Function}}
 */
export function createSegmentPersister({
  save,
  remove,
  flushEvery = DEFAULT_FLUSH_EVERY,
  maxFailures = 3,
  onError,
}) {
  let lastFlushed = 0;
  let failures = 0;
  let persisted = false;

  return {
    /** Offer a checkpoint; writes only when the flush policy says so. */
    async record(checkpoint) {
      if (failures >= maxFailures) return;
      const due = shouldFlushCheckpoint({
        completedIndex: checkpoint.completedIndex,
        totalSegments: checkpoint.totalSegments,
        lastFlushed,
        flushEvery,
      });
      if (!due) return;
      try {
        await save(checkpoint);
        lastFlushed = checkpoint.completedIndex;
        failures = 0;
        persisted = true;
      } catch (err) {
        failures++;
        // Storage problems must never abort synthesis — the audio is still
        // being produced correctly, it just isn't crash-proof any more.
        if (onError) onError(err, { failures, giveUp: failures >= maxFailures });
      }
    },

    /** Chapter finished — the full MP3 supersedes the segment checkpoint. */
    async done() {
      try {
        await remove();
      } catch (err) {
        if (onError) onError(err, { failures, giveUp: false });
      }
    },

    persistedAny() { return persisted; },
    failed() { return failures >= maxFailures; },
  };
}
