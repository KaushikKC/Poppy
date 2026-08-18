/**
 * Plans and the fair daily limit — the port of backend/billing.py.
 *
 * ## The decision for iOS v1: the logic ships, the paywall does not
 *
 * `DEFAULT_PLAN` is `plus`, so `paywallDue()` is always false and nobody meets a
 * locked door. That is deliberate, for two reasons.
 *
 * There is no price yet and no StoreKit product, so a paywall would be a door with no
 * handle: the user could neither continue nor pay. And an app with no in-app purchase
 * has a materially simpler App Store review than one with a subscription.
 *
 * The logic is ported anyway rather than stubbed out, because the interesting part is
 * not the counting, it is the guardrail: **a paywall is impossible during a vulnerable
 * moment.** That rule belongs in code now, while it is easy, not bolted on later when
 * a launch is being rushed. When there is a price, `DEFAULT_PLAN` becomes `free` and
 * StoreKit fills in `setPlan`; nothing else changes.
 */

import * as companion from './companion';
import { streakDay } from './streak';

export const TIERS: Record<string, {
  name: string;
  price: string;
  blurb: string;
  features: string[];
}> = {
  free: {
    name: 'Free',
    price: '₹0',
    blurb: 'Everything you need to build the habit.',
    features: [
      'A few calls a day',
      'Your companion, your vibe',
      'Core memory that remembers you',
      'Morning / night ritual',
      'Full privacy, export, and delete',
    ],
  },
  plus: {
    name: 'Poppy Plus',
    price: '₹299/mo · ₹2,499/yr',
    blurb: "For when Poppy's part of your day.",
    features: [
      'Unlimited, longer calls',
      'Richer voice and deeper memory',
      'Look-together and background calls',
      'Priority latency',
    ],
  },
};

/**
 * A *fair* daily limit, not a wall. Going over it during an ordinary call is where an
 * upgrade is invited; going over it during a vulnerable call is where the person is
 * simply allowed to talk.
 */
export const FREE_DAILY_CALLS = 5;

/** Modes where money is never mentioned. */
const VULNERABLE_MODES = new Set(['vent', 'wind']);

/** See the module note: no price, no StoreKit, so no paywall on iOS v1. */
const DEFAULT_PLAN = 'plus';

export async function plan(): Promise<string> {
  const p = await companion.profile();
  const saved = p.plan;
  return saved && TIERS[saved] ? saved : DEFAULT_PLAN;
}

export async function callsToday(): Promise<number> {
  const p = await companion.profile();
  const state = p.calls_day as { day?: string; count?: number } | null;
  if (!state || state.day !== streakDay()) return 0;
  return state.count ?? 0;
}

export async function recordCall(): Promise<number> {
  const count = (await callsToday()) + 1;
  await companion.update({
    calls_day: { day: streakDay(), count } as unknown as Record<string, unknown>,
  });
  return count;
}

/**
 * The guardrail. False for any vulnerable moment — a distress or crisis turn, or an
 * emotionally vulnerable mood — so a paywall there is impossible rather than merely
 * discouraged.
 */
export function canShowPaywall(
  context: { crisis?: boolean; distress?: boolean; mode?: string } = {},
): boolean {
  if (context.crisis || context.distress) return false;
  if (context.mode && VULNERABLE_MODES.has(context.mode)) return false;
  return true;
}

export async function paywallDue(
  context: { crisis?: boolean; distress?: boolean; mode?: string } = {},
): Promise<boolean> {
  if ((await plan()) !== 'free') return false;
  if ((await callsToday()) < FREE_DAILY_CALLS) return false;
  return canShowPaywall(context);
}

export async function entitlement(): Promise<Record<string, unknown>> {
  const p = await plan();
  const used = await callsToday();
  const limit = p !== 'free' ? null : FREE_DAILY_CALLS;
  return {
    plan: p,
    tier: TIERS[p] ?? TIERS.free,
    tiers: TIERS,
    calls_today: used,
    daily_limit: limit,
    calls_left: limit === null ? null : Math.max(0, limit - used),
    // What the UI reads to decide whether to show a locked state at all.
    entitled: p !== 'free',
    paywall: false,
  };
}

/** Where StoreKit will attach when there is a price. */
export async function setPlan(next: string): Promise<Record<string, unknown>> {
  await companion.update({ plan: TIERS[next] ? next : 'free' });
  return entitlement();
}
