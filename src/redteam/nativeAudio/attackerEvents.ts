import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

export class AttackerEventLog {
  private events: unknown[] = [];

  constructor(private readonly runDir: string) {}

  push(event: unknown) {
    this.events.push(event);
  }

  flush(filename = 'attacker-events.json') {
    const path = join(this.runDir, filename);
    appendFileSync(path, `${JSON.stringify(this.events)}\n`);
    this.events = [];
  }
}
