export const HZ = 120;
export class Clock {
  reset() { this.last = undefined; this.debt = 0; }
  constructor() { this.reset(); }
  frame(ms, step) {
    if (this.last !== undefined) {
      this.debt += Math.max(0, Math.min(100, ms - this.last)) * HZ;
    }
    this.last = ms;
    while (this.debt >= 1000 - 1e-8) {
      this.debt -= 1000;
      step();
    }
  }
}
