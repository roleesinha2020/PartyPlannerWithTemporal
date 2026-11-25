import { randomUUID } from 'node:crypto';
import type { MessageSender, OutgoingMessage } from './MessageSender.js';

// Prints messages instead of sending them. Optional FAIL_RATE (0..1) makes
// sends fail randomly so you can watch Temporal retry the activity.
export class ConsoleSender implements MessageSender {
  readonly channel = 'console';

  constructor(private failRate = Number(process.env.FAIL_RATE ?? 0)) {}

  async send(msg: OutgoingMessage): Promise<{ id: string }> {
    if (Math.random() < this.failRate) {
      throw new Error(`Simulated network failure sending to ${msg.to}`);
    }
    const id = randomUUID();
    console.log(`📨 [${this.channel}] to ${msg.to}\n   ${msg.body}\n   id=${id}`);
    return { id };
  }
}
