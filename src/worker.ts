// The worker is a long-running process that polls the task queue and executes
// workflow + activity code. The Temporal server never runs your code itself.
import { NativeConnection, Worker } from '@temporalio/worker';
import { createRequire } from 'node:module';
import { createActivities } from './activities.js';
import { createSender } from './messaging/index.js';
import { TASK_QUEUE } from './shared.js';

const require = createRequire(import.meta.url);

async function run() {
  const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
  const worker = await Worker.create({
    connection,
    taskQueue: TASK_QUEUE,
    // Workflows are bundled separately and run in a deterministic sandbox.
    workflowsPath: require.resolve('./workflows.ts'),
    activities: createActivities(createSender()),
  });
  console.log(`Worker listening on task queue "${TASK_QUEUE}"`);
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
