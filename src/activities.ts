// Activities = the "side-effect" code: network calls, DB writes, sending messages.
// They run in normal Node.js and may fail; Temporal retries them per the policy
// declared in the workflow.
import { log } from '@temporalio/activity';
import { planMenu } from './menu.js';
import type { MessageSender } from './messaging/index.js';
import type { Guest, Menu, Party } from './types.js';

// Dependency injection: the worker builds activities with a concrete sender.
export function createActivities(sender: MessageSender) {
  const message = async (guest: Guest, body: string) => {
    log.info('Sending message', { guest: guest.name, channel: sender.channel });
    return (await sender.send({ to: guest.phone, body })).id;
  };

  return {
    async sendInvitation(party: Party, guest: Guest): Promise<string> {
      return message(guest, `Hi ${guest.name}! ${party.host} invites you to "${party.title}" on ${party.date}. 🍽️ Reply yes, no or maybe.`);
    },

    async askDietaryRestrictions(party: Party, guest: Guest): Promise<string> {
      return message(guest, `Great, see you at "${party.title}"! Any dietary restrictions or allergies? Reply e.g. "vegetarian, nut allergy" or "none".`);
    },

    async planMenu(serves: number, requests: string[]): Promise<Menu> {
      return planMenu(serves, requests);
    },

    async sendMenu(party: Party, guest: Guest, menu: Menu): Promise<string> {
      const courses = menu.dishes.map((d) => `${d.course}: ${d.name}`).join(' · ');
      return message(guest, `The menu for "${party.title}" 🍷 ${courses}`);
    },
  };
}
