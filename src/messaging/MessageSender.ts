// The pluggable seam. Activities depend on this interface, never on a concrete
// channel, so swapping Console -> WhatsApp (Twilio) later is a one-line change
// in createSender().

export interface OutgoingMessage {
  to: string; // phone number in E.164
  body: string;
}

export interface MessageSender {
  readonly channel: string;
  send(msg: OutgoingMessage): Promise<{ id: string }>;
}
