// Minimal web UI server built on Node's http module, with no framework.
// It plays two roles:
//   1. A fake messaging provider: it receives messages from WebInboxSender
//      and keeps them in memory as each guest's "phone inbox".
//   2. A Temporal client: buttons on the page start the RSVP workflow, send
//      signals (`rsvp`, `dietary`) and poll the queries (`status`, `mealStatus`).
import { Client, Connection, WorkflowNotFoundError } from '@temporalio/client';
import type { Duration } from '@temporalio/common';
import type { QueryDefinition } from '@temporalio/workflow';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { guests, party, rsvpWorkflowId } from '../demo-data.js';
import { TASK_QUEUE } from '../shared.js';
import type { RsvpResponse } from '../types.js';
import { collectRsvpsWorkflow, dietarySignal, mealStatusQuery, rsvpSignal, statusQuery } from '../workflows.js';

const PORT = Number(process.env.PORT ?? 3000);
const mealWorkflowId = `meal-${party.id}`;

interface StoredMessage { id: string; to: string; body: string; at: string }
const inbox: StoredMessage[] = [];

const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
const client = new Client({ connection });

// Reads a workflow's state: the live query while it runs, the final result once it has closed.
async function workflowState<T>(workflowId: string, query: QueryDefinition<T>): Promise<{ state: string; status: T | null }> {
  const handle = client.workflow.getHandle(workflowId);
  let state: string;
  try {
    // describe() is answered by the server alone.
    state = (await handle.describe()).status.name; // RUNNING | COMPLETED | FAILED | TIMED_OUT …
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) return { state: 'NOT_STARTED', status: null };
    return { state: 'UNKNOWN', status: null };
  }
  if (state !== 'RUNNING') return { state, status: await handle.result().catch(() => null) };
  try {
    // A query must be answered by a worker running the workflow code. With no
    // worker polling the task queue, it fails (signals are still stored by the server).
    return { state, status: await withTimeout(handle.query(query), 3000) };
  } catch {
    return { state: 'NO_WORKER', status: null };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || '{}') as T;
}

function send(res: ServerResponse, code: number, data: unknown) {
  res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data));
}

const routes: Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>> = {
  'GET /': async (_req, res) => {
    const html = await readFile(new URL('./index.html', import.meta.url));
    res.writeHead(200, { 'content-type': 'text/html' }).end(html);
  },

  // Called by WebInboxSender, which runs inside the worker's activity.
  'POST /api/messages': async (req, res) => {
    const { to, body } = await readJson<{ to: string; body: string }>(req);
    const msg = { id: randomUUID(), to, body, at: new Date().toISOString() };
    inbox.push(msg);
    send(res, 200, { id: msg.id });
  },

  // Polled by the page every second.
  'GET /api/state': async (_req, res) => {
    const [rsvp, meal] = await Promise.all([
      workflowState(rsvpWorkflowId, statusQuery),
      workflowState(mealWorkflowId, mealStatusQuery),
    ]);
    // Only show meal planning that belongs to the current RSVP run.
    const mealForThisParty = rsvp.status?.mealWorkflowId ? meal : { state: 'NOT_STARTED', status: null };
    send(res, 200, { party, guests, workflowId: rsvpWorkflowId, mealWorkflowId, inbox, ...rsvp, meal: mealForThisParty });
  },

  'POST /api/start': async (req, res) => {
    const { deadline = '2 minutes', mealDeadline = '2 minutes' } = await readJson<{ deadline?: Duration; mealDeadline?: Duration }>(req);
    inbox.length = 0; // fresh phones for a fresh party
    await client.workflow.start(collectRsvpsWorkflow, {
      taskQueue: TASK_QUEUE,
      workflowId: rsvpWorkflowId,
      args: [party, guests, deadline, mealDeadline],
    });
    send(res, 200, { ok: true });
  },

  'POST /api/rsvp': async (req, res) => {
    const { guest, response } = await readJson<{ guest: string; response: RsvpResponse }>(req);
    await client.workflow.getHandle(rsvpWorkflowId).signal(rsvpSignal, { guest, response });
    send(res, 200, { ok: true });
  },

  'POST /api/dietary': async (req, res) => {
    const { guest, restrictions } = await readJson<{ guest: string; restrictions: string }>(req);
    await client.workflow.getHandle(mealWorkflowId).signal(dietarySignal, { guest, restrictions });
    send(res, 200, { ok: true });
  },
};

createServer(async (req, res) => {
  const route = routes[`${req.method} ${req.url?.split('?')[0]}`];
  if (!route) return send(res, 404, { error: 'Not found' });
  try {
    await route(req, res);
  } catch (err) {
    send(res, 500, { error: (err as Error).message });
  }
}).listen(PORT, () => console.log(`Party UI on http://localhost:${PORT}`));
