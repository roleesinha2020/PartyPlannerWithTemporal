// A task queue is the "mailbox" that connects clients, the server and workers.
// Every worker on a queue receives that queue's tasks, so separate queues keep
// experiments from interfering with each other.
export const TASK_QUEUE = process.env.TASK_QUEUE ?? 'party-planner';
