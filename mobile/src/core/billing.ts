/**
 * Plans and the ad guardrail — the port of backend/billing.py. Keep the two in step.
 *
 * ## What changed, and why the default flipped
 *
 * `DEFAULT_PLAN` was `plus`, because there was no price and no StoreKit product, and a
 * paywall with no way to pay is a door with no handle. There is a price now, and the
 * thing being sold is ads-off, so the same reasoning inverts: leaving everyone on
 * `plus` would mean no phone ever shows an ad and the free tier does not exist.
 * It is `free`, and StoreKit / Play Billing move a user off it.
 *
 * ## What did not change, and is the whole point of this file
 *
 * Free is the entire product, uncapped. The daily-call limit is gone: metering
 * conversation is the one thing this app will not do, and the person reaching for a
 * sixth call today is the one least well served by a locked door. $20 buys quiet.
 *
 * So one rule survives, and it matters more now than it ever did as a paywall rule:
 * **nothing interrupts a vulnerable moment.** An ad on top of someone venting is worse
 * than a paywall there. `canInterrupt()` makes it impossible rather than discouraged.
 */

import * as companion from './companion';

export const TIERS: Record<string, {
  name: string;
  price: string;
  blurb: string;
  features: string[];
}> = {
  free: {
    name: 'Free',
    price: '₹0',
    blurb: 'The whole thing, free.',
    features: [
      'Unlimited calls, always',
      'Your companion, your vibe',
      'Core memory that remembers you',
      'Morning / night ritual',
      'Full privacy, export, and delete',
      'A few ads between conversations',
    ],
  },
  plus: {
    name: 'Poppy Plus',
    price: '$20 once',
    blurb: 'The same Poppy, without the ads.',
    features: [
      'No ads, anywhere, ever',
      'Everything in Free, unchanged',
      'One payment, not a subscription',
    ],
  },
};

/** Modes where nothing is ever sold and nothing ever interrupts. */
const VULNERABLE_MODES = new Set(['vent', 'wind']);

/** There is a price now, so the free tier is real and is where everyone starts. */
const DEFAULT_PLAN = 'free';

/**
 * Two switches, because the two halves ship at different times. Keep in step with
 * billing.py.
 *
 * `ADS_LIVE` says ads may be requested. `BILLING_LIVE` says the upgrade may be offered.
 * They were one flag and that was wrong: it forced the sell and the buy to arrive
 * together, when the useful order is ads first (on Google's test units, which need no
 * account and cost nothing to get wrong) and the purchase after.
 *
 * The dangerous combination is `BILLING_LIVE` with no store bridge, because the button
 * would take no money and grant Plus anyway. That stays false until StoreKit and Play
 * Billing are wired. Ads without a purchase are merely annoying, not broken.
 */
export const ADS_LIVE = true;
const BILLING_LIVE = false;

export async function plan(): Promise<string> {
  // Nobody can have bought Plus while billing is not live, so a saved 'plus' cannot be
  // a purchase. It is the old default: companion.ts shipped `plan: 'plus'` back when
  // there was no price, and update() writes the whole profile, so every phone that ever
  // ran that build has it persisted. Trusting it would mean no existing install ever
  // sees an ad. Once billing is live the store receipt is re-resolved on every cold
  // start and overwrites this field, so the saved value becomes meaningful again.
  if (!BILLING_LIVE) return 'free';
  const p = await companion.profile();
  const saved = p.plan;
  return saved && TIERS[saved] ? saved : DEFAULT_PLAN;
}

/**
 * The guardrail. False for any vulnerable moment — a distress or crisis turn, or an
 * emotionally vulnerable mood. Every ad surface and every upgrade prompt goes through
 * here.
 */
export function canInterrupt(
  context: { crisis?: boolean; distress?: boolean; mode?: string } = {},
): boolean {
  if (context.crisis || context.distress) return false;
  if (context.mode && VULNERABLE_MODES.has(context.mode)) return false;
  return true;
}

/**
 * True when an ad may be requested right now. Check at *every* ad call site: a paid
 * user must never see a request fire, not even one that fails to fill.
 */
export async function shouldShowAds(
  context: { crisis?: boolean; distress?: boolean; mode?: string } = {},
): Promise<boolean> {
  if (!ADS_LIVE) return false;
  if ((await plan()) !== 'free') return false;
  return canInterrupt(context);
}

export async function entitlement(): Promise<Record<string, unknown>> {
  const p = await plan();
  return {
    plan: p,
    billing_live: BILLING_LIVE,
    // The only thing any caller branches on.
    ads: ADS_LIVE && p === 'free',
    tier: TIERS[p] ?? TIERS.free,
    tiers: TIERS,
  };
}

/**
 * Cache the tier. The authority is the store receipt, not this call: StoreKit's
 * `Transaction.currentEntitlements` and Play's `queryPurchasesAsync` are signed and
 * verified on-device, and are re-resolved on every cold start. This only records what
 * they said, so a wrong value here is corrected by the next launch rather than sold.
 */
export async function setPlan(next: string): Promise<Record<string, unknown>> {
  await companion.update({ plan: TIERS[next] ? next : 'free' });
  return entitlement();
}
