import logger from '../logger';

export class CIProgressReporter {
  private startTime: number;
  private lastUpdateTime: number;
  private totalTests: number;
  private completedTests: number = 0;
  private updateIntervalMs: number;
  private intervalId: NodeJS.Timeout | null = null;
  private milestonesSeen = new Set<number>();
  private highestPercentageSeen: number = 0;
  private lastErrorTime: number = 0;
  private readonly ERROR_THROTTLE_MS = 5000; // 5 seconds

  constructor(totalTests: number, updateIntervalMs: number = 30000) {
    this.startTime = Date.now();
    this.lastUpdateTime = this.startTime;
    this.totalTests = Math.max(totalTests, 1); // Ensure at least 1 to prevent division by zero
    this.updateIntervalMs = updateIntervalMs;
  }

  start(): void {
    // Clear any existing interval to prevent leaks
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    logger.info(`[Evaluation] Starting ${this.totalTests} test cases...`);

    // Set up periodic updates
    this.intervalId = setInterval(() => {
      this.logPeriodicUpdate();
    }, this.updateIntervalMs);
  }

  update(completed: number): void {
    this.completedTests = completed;

    // Log milestone updates at 25%, 50%, 75%
    const percentage = Math.floor((completed / this.totalTests) * 100);
    const milestones = [25, 50, 75];

    // Only log milestones if we're progressing forward
    if (percentage > this.highestPercentageSeen) {
      this.highestPercentageSeen = percentage;

      if (milestones.includes(percentage) && !this.milestonesSeen.has(percentage)) {
        this.milestonesSeen.add(percentage);
        this.logMilestone(percentage);
      }
    }
  }

  updateTotalTests(newTotal: number): void {
    this.totalTests = Math.max(newTotal, 1);
    // Recalculate percentage with new total
    const percentage = Math.floor((this.completedTests / this.totalTests) * 100);
    this.highestPercentageSeen = percentage;
  }

  finish(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const elapsed = this.formatElapsedTime(Date.now() - this.startTime);
    logger.info(
      `[Evaluation] ✓ Complete! ${this.completedTests}/${this.totalTests} tests in ${elapsed}`,
    );

    // GitHub Actions specific output
    if (process.env.GITHUB_ACTIONS) {
      console.log(
        `::notice::Evaluation completed: ${this.completedTests}/${this.totalTests} tests in ${elapsed}`,
      );
    }
  }

  error(message: string): void {
    // Throttle rapid errors to prevent log spam
    const now = Date.now();
    if (now - this.lastErrorTime < this.ERROR_THROTTLE_MS) {
      return;
    }
    this.lastErrorTime = now;

    logger.error(`[Evaluation Error] ${message}`);

    if (process.env.GITHUB_ACTIONS) {
      // Escape special characters for GitHub Actions
      const escapedMessage = message.replace(/\r?\n/g, ' ').replace(/::/g, ' ');
      console.log(`::error::${escapedMessage}`);
    }
  }

  private logPeriodicUpdate(): void {
    if (this.completedTests === 0 || this.completedTests === this.totalTests) {
      return;
    }

    const elapsed = Math.max(Date.now() - this.startTime, 1000); // Minimum 1 second
    const rate = this.completedTests / (elapsed / 1000 / 60); // tests per minute
    const remaining = this.totalTests - this.completedTests;

    // Prevent division by very small rates and handle edge cases
    let etaDisplay: string;
    if (rate < 0.1) {
      // Less than 0.1 tests per minute
      etaDisplay = 'calculating...';
    } else {
      const eta = remaining / rate;
      if (eta > 1440) {
        // More than 24 hours
        etaDisplay = '>24 hours';
      } else {
        etaDisplay = `${Math.round(eta)} minute${Math.round(eta) !== 1 ? 's' : ''}`;
      }
    }

    const percentage = Math.floor((this.completedTests / this.totalTests) * 100);

    logger.info(
      `[CI Progress] Evaluation running for ${this.formatElapsedTime(elapsed)} - ` +
        `Completed ${this.completedTests}/${this.totalTests} tests (${percentage}%)`,
    );
    logger.info(`[CI Progress] Rate: ~${Math.round(rate)} tests/minute, ` + `ETA: ${etaDisplay}`);
  }

  private logMilestone(percentage: number): void {
    const elapsed = this.formatElapsedTime(Date.now() - this.startTime);
    logger.info(
      `[Evaluation] ✓ ${percentage}% complete (${this.completedTests}/${this.totalTests}) - ${elapsed} elapsed`,
    );

    // GitHub Actions annotation
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::notice::Evaluation ${percentage}% complete`);
    }
  }

  private formatElapsedTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes === 0) {
      return `${seconds}s`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  }
}
