// Simulates a guest replying. Later, a WhatsApp webhook will do exactly this:
// turn an inbound message into a signal on the party's workflow.
// Usage: npm run rsvp -- <guest> <yes|no|maybe>      (send a signal)
//        npm run rsvp:status                          (run the query)
import { Client, Connection } from '@temporalio/client';
import type { RsvpResponse } from './types.js';
import { rsvpSignal, statusQuery } from './workflows.js';

const workflowId = process.env.WORKFLOW_ID ?? 'rsvp-party-001';

async function run() {
  const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
  const handle = new Client({ connection }).workflow.getHandle(workflowId);

  const [guest, response] = process.argv.slice(2);
  if (guest !== '--status') {
    if (!guest || !['yes', 'no', 'maybe'].includes(response)) {
      throw new Error('Usage: npm run rsvp -- <guest> <yes|no|maybe>');
    }
    await handle.signal(rsvpSignal, { guest, response: response as RsvpResponse });
    console.log(`Signaled ${workflowId}: ${guest} → ${response}`);
  }
  console.log(await handle.query(statusQuery));
}

run().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
