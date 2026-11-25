# 🍽️ PartyPlannerWithTemporal

A learning project built in phases with **Temporal** (durable workflows), **Supabase** (Postgres and auth) and **TypeScript**. Messages go through a pluggable `MessageSender`, so the console sender used now can be replaced with WhatsApp (Twilio sandbox) later without touching any workflow code.

## Roadmap

| Phase | Focus | You learn |
|---|---|---|
| **1 ✅** | Send invitations through a Temporal workflow and a console sender | Workflows vs. activities, workers, task queues, retries |
| **1b ✅** | Collect RSVPs with signals, queries and a deadline timer | Long-running workflows, `condition()`, durable timers |
| **1c ✅** | Chain a meal planning workflow after all RSVPs arrive | Child workflows, `ParentClosePolicy` |
| 2 | Store parties, guests and RSVPs in Supabase | Supabase CLI, local Postgres, migrations, the `supabase-js` client |
| 3 | Persist RSVPs as they arrive and let the host extend the deadline | Updates, activities called from signal-driven code |
| 4 | Send reminders and a final headcount | Schedules, child workflows, `continueAsNew` |
| 5 | Add WhatsApp through the Twilio sandbox | Swapping the `MessageSender` implementation, inbound webhooks feeding signals |

## Architecture (Phase 1)

```
start.ts (client) ──start──▶ Temporal Server ◀──poll── worker.ts
                                (localhost:7233)          ├─ workflows.ts  (deterministic orchestration)
                                UI: localhost:8233        └─ activities.ts (side effects)
                                                                └─ MessageSender ─▶ ConsoleSender (WhatsApp later)
```

## Setup steps

```bash
# 1. Project scaffolding
git init
npm init -y
npm pkg set type=module          # use native ES modules

# 2. Temporal SDK packages (one per role)
npm i @temporalio/client @temporalio/worker @temporalio/workflow @temporalio/activity
#   client   → start and query workflows
#   worker   → host process that runs your code
#   workflow → APIs available inside workflows (sandboxed)
#   activity → APIs available inside activities (logging, heartbeats)

# 3. TypeScript tooling
npm i -D typescript tsx @types/node   # tsx runs .ts files directly, with no build step

# 4. Temporal CLI. It includes a single-binary dev server with an in-memory DB and the Web UI.
brew install temporal
```

## Run it (3 terminals)

```bash
temporal server start-dev     # T1: server on :7233, Web UI on http://localhost:8233
npm run worker                # T2: polls the "party-planner" task queue
npm run start                 # T3: starts inviteGuestsWorkflow and prints the results
```

**See retries in action:** restart the worker with `FAIL_RATE=0.5 npm run worker`. Each send now fails half the time. Temporal retries every failed activity with exponential backoff (1s, 2s, 4s…, up to 5 attempts), and the workflow still finishes. To see each attempt, open the workflow in the Web UI and look at its **Event History**.

**See durability:** stop the worker (Ctrl-C) while a workflow is running, then start it again. The workflow continues from where it stopped, because its state lives in the server's event history and not in the worker's memory.

## Collect RSVPs (Phase 1b)

`collectRsvpsWorkflow` sends the invitations, then **waits** until every guest has replied or the deadline passes, whichever comes first.

```bash
npm run start:rsvp -- "5 minutes"     # start it (fixed ID: rsvp-party-001); the deadline argument is optional
npm run rsvp -- Asha yes              # send a SIGNAL: a guest replies (yes | no | maybe)
npm run rsvp:status                   # run a QUERY: read live state without changing it

# The same operations through the Temporal CLI, with no code needed:
temporal workflow signal -w rsvp-party-001 --name rsvp --input '{"guest":"Ben","response":"no"}'
temporal workflow query  -w rsvp-party-001 --type status
temporal workflow result -w rsvp-party-001   # blocks until the workflow finishes
```

Try these:
- Answer for all 3 guests. The workflow completes right away with `complete: true`.
- Start it with `"20 seconds"` and answer for only one guest. The timer fires and the result shows `deadlinePassed: true`.
- Stop the worker while the workflow is waiting, send a signal, then start the worker again. The signal was stored on the server, so it isn't lost.

> ⚠️ After changing workflow code, **restart the worker**. Workflows are bundled when the worker starts. If an old worker is still polling the same task queue, you'll see `no such function is exported by the workflow bundle`.

## Meal planning, a chained child workflow (Phase 1c)

Once **every** guest has replied, `collectRsvpsWorkflow` starts `mealPlanningWorkflow` (ID `meal-party-001`) for the guests who said **yes**:

```
collectRsvpsWorkflow ──all answered & ≥1 yes──▶ startChild(mealPlanningWorkflow)  ──▶ RSVP workflow completes
                                                   │ (parentClosePolicy: ABANDON → the child keeps running)
                                                   ├─ askDietaryRestrictions  (activity, one per attendee)
                                                   ├─ wait for `dietary` signals or the deadline
                                                   ├─ planMenu                (activity → src/menu.ts)
                                                   └─ sendMenu                (activity, one per attendee)
```

```bash
# Reply with dietary needs, from the UI's phones or from the CLI:
temporal workflow signal -w meal-party-001 --name dietary --input '{"guest":"Asha","restrictions":"vegetarian, nut allergy"}'
temporal workflow query  -w meal-party-001 --type mealStatus
temporal workflow result -w meal-party-001
```

- **`startChild` vs. `executeChild`**: `startChild` returns once the child has started, and `executeChild` waits for the child's result. We use `startChild`, so the RSVP workflow can finish while meal planning carries on.
- **`ParentClosePolicy.ABANDON`**: without it, the default (`TERMINATE`) would kill the child the moment the parent completes.
- In the Web UI, the RSVP workflow's history shows `StartChildWorkflowExecutionInitiated` and then `ChildWorkflowExecutionStarted`, and the child links back to its parent.
- If the RSVP deadline passes before everyone answers, no meal planning starts. A `maybe` doesn't count as attending.

## Visual UI: guests' "phones"

By default, invitations are only printed in the **worker terminal** (`📨 [console]`). The `web` channel delivers them to a local page instead. The page shows each guest's phone with their messages and Yes / No / Maybe buttons.

```bash
temporal server start-dev     # T1: server (leave it running)
npm run ui                    # T2: web UI at http://localhost:3000 (start it before the worker sends anything)
npm run worker:web            # T3: worker using MESSAGE_CHANNEL=web
```

Open http://localhost:3000, click **Send invitations**, then reply from each phone. The workflow's own view is at http://localhost:8233.

How the pieces connect:
```
Browser ──click──▶ src/web/server.ts ──start / signal / query──▶ Temporal ◀── worker (MESSAGE_CHANNEL=web)
   ▲                     ▲                                                        │
   └──polls /api/state───┤◀──────────── POST /api/messages (WebInboxSender) ──────┘
```

- **The `web` channel** ([src/messaging/WebInboxSender.ts](src/messaging/WebInboxSender.ts)) sends each message as an HTTP POST, much like Twilio's API. Stop `npm run ui` and send invitations: the activity fails and retries. Start the UI again, and the pending invitations arrive.
- **One worker per task queue for a given channel.** If a console worker and a web worker poll the same queue, the invitations get split between them. Stop one, or give each its own queue with `TASK_QUEUE=other`.
- Inboxes are kept in memory, so restarting the UI empties them. Phase 2 stores messages in Supabase.

## Key concepts

- **Workflow** ([src/workflows.ts](src/workflows.ts)): orchestration code that must be **deterministic** (no I/O, randomness or wall-clock time). Temporal replays it from the event history to rebuild its state.
- **Activity** ([src/activities.ts](src/activities.ts)): normal code that does the risky work (network, DB) and can fail. The retry policy lives in the workflow's `proxyActivities` call.
- **Worker** ([src/worker.ts](src/worker.ts)): your process. It hosts workflows and activities. The server only stores state and hands out tasks.
- **Task queue**: the named channel that connects the client, the server and workers.
- **Signal**: a one-way message into a running workflow (`defineSignal` plus `setHandler`). Each signal is recorded in the event history, so on replay the state is rebuilt with the signal included.
- **Query**: a read-only view of workflow state. It must not change state or call activities.
- **`condition(fn, timeout)`**: a durable wait. It returns `true` when `fn()` becomes true, or `false` if the timer fires first. The timer is stored on the server, so it can run for days.
- **MessageSender** ([src/messaging/](src/messaging/)): a single interface plus a factory that picks the implementation from `MESSAGE_CHANNEL`. Activities receive the sender through dependency injection.

## Useful CLI commands

```bash
temporal workflow list                         # recent workflows
temporal workflow show -w <workflowId>         # event history in the terminal
temporal workflow describe -w <workflowId>     # status, pending activities
```
