import type { MessageSender, OutgoingMessage } from './MessageSender.js';

// Delivers messages over HTTP to the local web UI's "phones" (src/web/server.ts).
// It works much like a real provider: an HTTP POST that can fail. If the web
// server is down, the activity throws and Temporal retries it until the server is back.
export class WebInboxSender implements MessageSender {
  readonly channel = 'web';

  constructor(private baseUrl = process.env.WEB_INBOX_URL ?? 'http://localhost:3000') {}

  async send(msg: OutgoingMessage): Promise<{ id: string }> {
    const res = await fetch(`${this.baseUrl}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(msg),
    });
    if (!res.ok) throw new Error(`Web inbox responded ${res.status}`);
    return (await res.json()) as { id: string };
  }
}
