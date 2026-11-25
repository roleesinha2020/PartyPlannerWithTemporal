import { ConsoleSender } from './ConsoleSender.js';
import type { MessageSender } from './MessageSender.js';
import { WebInboxSender } from './WebInboxSender.js';

export type { MessageSender, OutgoingMessage } from './MessageSender.js';

// Factory chosen by env var. Later phases add: case 'whatsapp': return new TwilioWhatsAppSender(...)
export function createSender(channel = process.env.MESSAGE_CHANNEL ?? 'console'): MessageSender {
  switch (channel) {
    case 'console':
      return new ConsoleSender();
    case 'web':
      return new WebInboxSender();
    default:
      throw new Error(`Unknown MESSAGE_CHANNEL "${channel}"`);
  }
}
