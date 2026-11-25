// Pure menu-planning logic, kept out of Temporal so it's easy to read and test.
// It runs inside an activity: a later phase could replace it with a call to an
// LLM or a recipe API, which is exactly the kind of work activities are for.
import type { Dish, Menu } from './types.js';

type Tag = 'vegetarian' | 'vegan' | 'gluten-free' | 'nut-free' | 'dairy-free';

const CATALOG: (Dish & { tags: Tag[] })[] = [
  { course: 'starter', name: 'Burrata with heirloom tomatoes', tags: ['vegetarian', 'gluten-free', 'nut-free'] },
  { course: 'starter', name: 'Roasted squash soup with toasted seeds', tags: ['vegetarian', 'vegan', 'gluten-free', 'nut-free', 'dairy-free'] },
  { course: 'starter', name: 'Prawn cocktail', tags: ['gluten-free', 'nut-free', 'dairy-free'] },
  { course: 'main', name: 'Herb-crusted lamb with dauphinoise', tags: ['gluten-free', 'nut-free'] },
  { course: 'main', name: 'Wild mushroom risotto', tags: ['vegetarian', 'gluten-free', 'nut-free'] },
  { course: 'main', name: 'Chickpea & spinach curry with rice', tags: ['vegetarian', 'vegan', 'gluten-free', 'nut-free', 'dairy-free'] },
  { course: 'dessert', name: 'Pistachio tart', tags: ['vegetarian'] },
  { course: 'dessert', name: 'Dark chocolate mousse', tags: ['vegetarian', 'gluten-free', 'nut-free'] },
  { course: 'dessert', name: 'Poached pears in spiced wine', tags: ['vegetarian', 'vegan', 'gluten-free', 'nut-free', 'dairy-free'] },
];

// Map free-text words to tags. "nut allergy" → nut-free, "coeliac" → gluten-free…
const KEYWORDS: [RegExp, Tag[]][] = [
  [/vegan/, ['vegan', 'vegetarian', 'dairy-free']],
  [/vegetarian|veggie|no meat/, ['vegetarian']],
  [/gluten|coeliac|celiac/, ['gluten-free']],
  [/nut|peanut/, ['nut-free']],
  [/dairy|lactose|milk/, ['dairy-free']],
];
const NOTHING = /^(none|no|nothing|n\/a|-)?$/;

export function planMenu(serves: number, requests: string[]): Menu {
  const needed = new Set<Tag>();
  const notes: string[] = [];

  for (const raw of requests) {
    for (const part of raw.toLowerCase().split(/[,;&]| and /).map((p) => p.trim())) {
      if (NOTHING.test(part)) continue;
      const match = KEYWORDS.find(([re]) => re.test(part));
      if (match) match[1].forEach((t) => needed.add(t));
      else notes.push(part); // e.g. "shellfish": the planner can't handle it, so flag it
    }
  }

  // For each course, pick the first dish that satisfies every restriction.
  // The catalog's last dish in each course meets all of them, so a pick always exists.
  const dishes = (['starter', 'main', 'dessert'] as const).map((course) => {
    const dish = CATALOG.find((d) => d.course === course && [...needed].every((t) => d.tags.includes(t)))!;
    return { course, name: dish.name };
  });

  return { serves, dishes, accommodates: [...needed], notes };
}
