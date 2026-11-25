// Workflows = durable orchestration. This code must be deterministic: no direct
// I/O, no Math.random(), no Date.now() side effects. Temporal records every step
// in an event history and can replay it after a crash to rebuild state.
import {
  condition,
  defineQuery,
  defineSignal,
  log,
  ParentClosePolicy,
  proxyActivities,
  setHandler,
  startChild,
} from '@temporalio/workflow';
import type { Duration } from '@temporalio/common';
import type { createActivities } from './activities.js';
import type {
  DietarySignal,
  Guest,
  InviteResult,
  MealPlanStatus,
  Party,
  RsvpSignal,
  RsvpStatus,
} from './types.js';

// We import only the *type* of the activities. proxyActivities returns stubs that
// schedule activity tasks on the server instead of running code here.
const { sendInvitation, askDietaryRestrictions, planMenu, sendMenu } = proxyActivities<
  ReturnType<typeof createActivities>
>({
  startToCloseTimeout: '10 seconds',
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumAttempts: 5 },
});

export async function inviteGuestsWorkflow(party: Party, guests: Guest[]): Promise<InviteResult[]> {
  // Fan out: send all invitations in parallel; each is retried independently.
  const ids = await Promise.all(guests.map((g) => sendInvitation(party, g)));
  return guests.map((g, i) => ({ guest: g.name, messageId: ids[i] }));
}

// ── RSVP collection ─────────────────────────────────────────────────────────
// Signal = a one-way message *into* a running workflow (e.g. "Asha said yes").
// Query  = a read-only peek at workflow state; it must not change anything.
// Both are defined by name so clients (or the CLI) can call them by that name.
export const rsvpSignal = defineSignal<[RsvpSignal]>('rsvp');
export const statusQuery = defineQuery<RsvpStatus>('status');

export async function collectRsvpsWorkflow(
  party: Party,
  guests: Guest[],
  deadline: Duration = '2 minutes', // any duration: '30 seconds', '3 days'…
  mealDeadline: Duration = '2 minutes', // passed on to meal planning
): Promise<RsvpStatus> {
  // Plain variables ARE the durable state: after a crash, replaying the event
  // history (including every received signal) rebuilds them exactly.
  const responses: RsvpStatus['responses'] = Object.fromEntries(guests.map((g) => [g.name, 'pending']));
  let deadlinePassed = false;
  let mealWorkflowId: string | null = null;

  const status = (): RsvpStatus => {
    const values = Object.values(responses);
    return {
      responses: { ...responses },
      attending: values.filter((r) => r === 'yes').length,
      complete: values.every((r) => r !== 'pending'),
      deadlinePassed,
      mealWorkflowId,
    };
  };

  // Register handlers *before* any await so no early signal is missed.
  setHandler(rsvpSignal, ({ guest, response }) => {
    if (!(guest in responses)) {
      log.warn('RSVP from unknown guest ignored', { guest });
      return;
    }
    responses[guest] = response; // guests may change their mind until the deadline
    log.info('RSVP received', { guest, response });
  });
  setHandler(statusQuery, status);

  await Promise.all(guests.map((g) => sendInvitation(party, g)));

  // Durable wait: resolves when every guest has answered, or returns false when
  // the timer fires. The timer lives on the server, so it survives worker restarts.
  const allAnswered = await condition(() => status().complete, deadline);
  deadlinePassed = !allAnswered;

  // Chain the next stage: only once ALL guests have answered, and only if
  // someone is coming. "maybe" isn't counted as attending.
  const attendees = guests.filter((g) => responses[g.name] === 'yes');
  if (allAnswered && attendees.length > 0) {
    // startChild returns once the child has *started*; it doesn't wait for it
    // to finish. ABANDON means the child keeps running after this workflow
    // completes. (The default, TERMINATE, would kill it as soon as we return.)
    const child = await startChild(mealPlanningWorkflow, {
      workflowId: `meal-${party.id}`,
      args: [party, attendees, mealDeadline],
      parentClosePolicy: ParentClosePolicy.ABANDON,
    });
    mealWorkflowId = child.workflowId;
    log.info('Meal planning started', { mealWorkflowId });
  }

  return status();
}

// ── Meal planning (child workflow) ──────────────────────────────────────────
export const dietarySignal = defineSignal<[DietarySignal]>('dietary');
export const mealStatusQuery = defineQuery<MealPlanStatus>('mealStatus');

export async function mealPlanningWorkflow(
  party: Party,
  attendees: Guest[],
  deadline: Duration = '2 minutes',
): Promise<MealPlanStatus> {
  const diets: MealPlanStatus['diets'] = Object.fromEntries(attendees.map((g) => [g.name, null]));
  let stage: MealPlanStatus['stage'] = 'collecting-diets';
  let menu: MealPlanStatus['menu'] = null;

  const status = (): MealPlanStatus => ({ stage, diets: { ...diets }, menu });

  setHandler(dietarySignal, ({ guest, restrictions }) => {
    if (!(guest in diets) || stage !== 'collecting-diets') return; // ignore late or unknown replies
    diets[guest] = restrictions;
  });
  setHandler(mealStatusQuery, status);

  // 1. Ask every attendee about dietary needs.
  await Promise.all(attendees.map((g) => askDietaryRestrictions(party, g)));

  // 2. Wait for every answer, or the deadline. Missing answers count as "none".
  await condition(() => Object.values(diets).every((d) => d !== null), deadline);

  // 3. Plan the menu (an activity, so a slow or flaky planner gets retries).
  stage = 'planning';
  const requests = Object.values(diets).filter((d): d is string => d !== null);
  menu = await planMenu(attendees.length, requests);

  // 4. Share it with every attendee.
  await Promise.all(attendees.map((g) => sendMenu(party, g, menu!)));
  stage = 'menu-sent';

  return status();
}
