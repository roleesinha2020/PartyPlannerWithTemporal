// Starts collectRsvpsWorkflow and exits right away (the workflow keeps running
// on the server). Usage: npm run start:rsvp -- [deadline], e.g. "5 minutes"
import { Client, Connection } from '@temporalio/client';
import type { Duration } from '@temporalio/common';
import { guests, party, rsvpWorkflowId as workflowId } from './demo-data.js';
import { TASK_QUEUE } from './shared.js';
import { collectRsvpsWorkflow } from './workflows.js';

const deadline = (process.argv[2] ?? '2 minutes') as Duration;

async function run() {
  const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
  const client = new Client({ connection });

  // A fixed, meaningful ID makes it easy to signal later. Temporal refuses to
  // start a second *running* workflow with the same ID, which guards against duplicates.
  await client.workflow.start(collectRsvpsWorkflow, { taskQueue: TASK_QUEUE, workflowId, args: [party, guests, deadline] });

  console.log(`Started ${workflowId} (deadline: ${deadline}). Try:
  npm run rsvp -- Asha yes
  npm run rsvp:status
  temporal workflow result -w ${workflowId}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
