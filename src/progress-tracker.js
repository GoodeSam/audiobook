/**
 * Multi-phase progress tracker.
 *
 * Tracks progress across multiple sequential phases (e.g. translation then TTS),
 * each with a weight that determines its share of overall progress.
 */

const PHASE_LABELS = {
  translating: 'Translating',
  generating: 'Generating',
};

export class ProgressTracker {
  /**
   * @param {Array<{name: string, weight: number}>} phases
   */
  constructor(phases) {
    this._phases = phases;
    this._totalWeight = phases.reduce((sum, p) => sum + p.weight, 0);
    this._completedWeight = 0;
    this._currentPhaseName = null;
    this._currentPhaseWeight = 0;
    this._currentTotal = 0;
    this._currentStep = 0;
    this._cancelled = false;
    this._callbacks = [];
  }

  get currentPhase() {
    return this._currentPhaseName;
  }

  get cancelled() {
    return this._cancelled;
  }

  get overallPercent() {
    if (this._totalWeight === 0) return 0;

    const phaseProgress = this._currentTotal > 0
      ? this._currentStep / this._currentTotal
      : 0;

    const completedPct = (this._completedWeight / this._totalWeight) * 100;
    const currentPct = (this._currentPhaseWeight / this._totalWeight) * phaseProgress * 100;

    return Math.round(completedPct + currentPct);
  }

  get statusText() {
    const label = PHASE_LABELS[this._currentPhaseName] || this._currentPhaseName || 'Working';
    return `${label}: ${this._currentStep} / ${this._currentTotal}`;
  }

  /**
   * Start a new phase.
   * @param {string} name - Phase name (must match a phase in constructor).
   * @param {number} total - Total steps in this phase.
   */
  startPhase(name, total) {
    // If switching from a previous phase, mark it complete
    if (this._currentPhaseName && this._currentPhaseName !== name) {
      this._completedWeight += this._currentPhaseWeight;
    }

    this._currentPhaseName = name;
    this._currentTotal = total;
    this._currentStep = 0;

    const phase = this._phases.find(p => p.name === name);
    this._currentPhaseWeight = phase ? phase.weight : 0;
  }

  /**
   * Update progress to a specific step.
   * @param {number} step - Current step number.
   */
  advance(step) {
    this._currentStep = step;
    this._fireCallbacks();
  }

  /**
   * Register a progress callback.
   * @param {Function} cb - Called with { phase, current, total, overallPercent }.
   */
  onProgress(cb) {
    this._callbacks.push(cb);
  }

  cancel() {
    this._cancelled = true;
  }

  reset() {
    this._completedWeight = 0;
    this._currentPhaseName = null;
    this._currentPhaseWeight = 0;
    this._currentTotal = 0;
    this._currentStep = 0;
    this._cancelled = false;
  }

  _fireCallbacks() {
    const status = {
      phase: this._currentPhaseName,
      current: this._currentStep,
      total: this._currentTotal,
      overallPercent: this.overallPercent,
    };
    for (const cb of this._callbacks) {
      cb(status);
    }
  }
}
