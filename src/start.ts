// The client: starts a workflow and waits for its result. In later phases this
// becomes an API/CLI that reads the party and guests from Supabase.
import { Client, Connection } from '@temporalio/client';
import { guests, party } from './demo-data.js';
import { TASK_QUEUE } from './shared.js';
import { inviteGuestsWorkflow } from './workflows.js';

async function run() {
  const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
  const client = new Client({ connection });

  const handle = await client.workflow.start(inviteGuestsWorkflow, {
    taskQueue: TASK_QUEUE,
    workflowId: `invite-${party.id}-${Date.now()}`, // business-meaningful ID
    args: [party, guests],
  });
  console.log(`Started ${handle.workflowId} — watch it at http://localhost:8233`);
  console.table(await handle.result());
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
