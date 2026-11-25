// Shared domain types. Plain data only: these cross the Temporal boundary
// (workflow inputs/outputs are serialized to JSON), so no classes or functions.

export interface Guest {
  name: string;
  phone: string; // E.164, e.g. "+15551234567" — WhatsApp will need this later
}

export interface Party {
  id: string;
  title: string;
  host: string;
  date: string; // ISO date string
}

export type RsvpResponse = 'yes' | 'no' | 'maybe';

// Payload of the `rsvp` signal (what a guest's reply turns into).
export interface RsvpSignal {
  guest: string; // guest name, must match a Guest.name
  response: RsvpResponse;
}

// What the `status` query returns, and the workflow's final result.
export interface RsvpStatus {
  responses: Record<string, RsvpResponse | 'pending'>;
  attending: number;
  complete: boolean; // true once every guest has answered
  deadlinePassed: boolean;
  mealWorkflowId: string | null; // set once the meal-planning child workflow starts
}

// ── Meal planning ───────────────────────────────────────────────────────────
// Payload of the `dietary` signal: free text, the way a guest would type it.
export interface DietarySignal {
  guest: string;
  restrictions: string; // e.g. "vegetarian, nut allergy" or "none"
}

export interface Dish {
  course: 'starter' | 'main' | 'dessert';
  name: string;
}

export interface Menu {
  serves: number;
  dishes: Dish[];
  accommodates: string[]; // restrictions every dish satisfies
  notes: string[]; // requests the planner didn't recognise; the host should check these
}

export interface MealPlanStatus {
  stage: 'collecting-diets' | 'planning' | 'menu-sent';
  diets: Record<string, string | null>; // null = not answered yet
  menu: Menu | null;
}

export interface InviteResult {
  guest: string;
  messageId: string;
}
