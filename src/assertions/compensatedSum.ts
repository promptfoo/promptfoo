/** Neumaier summation keeps rounding error from accumulating across assertion scores. */
export class CompensatedSum {
  private sum = 0;
  private correction = 0;

  add(value: number): void {
    const next = this.sum + value;
    if (Number.isFinite(next)) {
      this.correction +=
        Math.abs(this.sum) >= Math.abs(value) ? this.sum - next + value : value - next + this.sum;
    } else {
      // Preserve ordinary Infinity/NaN propagation when an input or the sum overflows.
      this.correction = 0;
    }
    this.sum = next;
  }

  get total(): number {
    return this.sum + this.correction;
  }
}
