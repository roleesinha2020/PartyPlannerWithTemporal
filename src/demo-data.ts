// Demo party and guests shared by the scripts and the web UI.
// Phase 2 replaces this file with reads from Supabase.
import type { Guest, Party } from './types.js';

export const party: Party = { id: 'party-001', title: 'Autumn Supper', host: 'Rolee', date: '2026-12-05' };

export const guests: Guest[] = [
  { name: 'Asha', phone: '+15550000001' },
  { name: 'Ben', phone: '+15550000002' },
  { name: 'Chen', phone: '+15550000003' },
];

export const rsvpWorkflowId = `rsvp-${party.id}`;
