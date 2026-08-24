/**
 * Identity and credits on the phone — the port of backend/accounts.py.
 *
 * Same shape, same warning. The ledger is a file in the app's own container and the
 * model runs on the user's own hardware, so nothing here can be enforced against a
 * determined user. A credit is only enforceable against something a server controls;
 * until this moves behind an API, these numbers are a UI affordance and a fair-use
 * nudge, not a revenue control.
 *
 * Stored through store.ts like everything else rather than in SQLite: the desktop uses
 * a database because it already had one for sessions and turns, and there is nothing
 * here that needs one.
 */

import { readJson, writeJson } from './store';

const FILE = 'account.json';

/** What a new account starts with. Replace when pricing is decided. */
export const SIGNUP_GRANT = 100;

/**
 * Apple is not optional. An iOS app that offers a third-party login has to offer Sign
 * in with Apple as well (App Store Guideline 4.8), so a Google-only build fails review.
 */
// 'local' is a name and an email typed into our own form: it identifies, it does not
// authenticate. Fine for holding credits in a test build, unfit to gate anything paid.
export const PROVIDERS = ['google', 'apple', 'local'] as const;
export type Provider = (typeof PROVIDERS)[number];

export type Movement = { delta: number; reason: string; at: number };

type Stored = {
  account: { provider: Provider; subject: string; email: string; name: string; created_at: number } | null;
  /** A ledger, not a balance. "Where did my credits go" needs an answer. */
  credits: Movement[];
};

const EMPTY: Stored = { account: null, credits: [] };

async function load(): Promise<Stored> {
  const s = await readJson<Stored>(FILE, EMPTY);
  return { account: s.account ?? null, credits: Array.isArray(s.credits) ? s.credits : [] };
}

export async function balance(): Promise<number> {
  return (await load()).credits.reduce((n, m) => n + m.delta, 0);
}

export async function grant(n: number, reason: string): Promise<number> {
  if (n <= 0) throw new Error('a grant adds credits; use spend() to take them');
  const s = await load();
  s.credits.push({ delta: n, reason, at: Date.now() / 1000 });
  await writeJson(FILE, s);
  return s.credits.reduce((t, m) => t + m.delta, 0);
}

/**
 * Take credits for something that happened. Never refuses, and the balance may go
 * negative: a conversation cut off because a number hit zero is the mid-vent paywall
 * arriving through a different door, which billing.py already forbids.
 */
export async function spend(n: number, reason: string): Promise<Record<string, unknown>> {
  if (n <= 0) throw new Error('a spend takes credits; use grant() to add them');
  const s = await load();
  s.credits.push({ delta: -n, reason, at: Date.now() / 1000 });
  await writeJson(FILE, s);
  return status(s);
}

export async function signIn(
  provider: string,
  subject: string,
  email = '',
  name = '',
): Promise<Record<string, unknown>> {
  if (!(PROVIDERS as readonly string[]).includes(provider)) {
    throw new Error(`unknown provider: ${provider}`);
  }
  if (!subject) throw new Error('a sign-in needs a subject id');
  const s = await load();
  const first = s.account === null;
  // Apple returns the email and name only on the first authorisation; every sign-in
  // after that carries the subject and nulls. A blank field means "unchanged", never
  // "cleared" — see the note in backend/accounts.py.
  const prev = s.account && s.account.subject === subject ? s.account : null;
  s.account = {
    provider: provider as Provider,
    subject,
    email: email || prev?.email || '',
    name: name || prev?.name || '',
    created_at: Date.now() / 1000,
  };
  if (first) s.credits.push({ delta: SIGNUP_GRANT, reason: 'signup', at: Date.now() / 1000 });
  await writeJson(FILE, s);
  return status(s);
}

/** Forget the identity, keep the ledger. Signing out is not deleting an account. */
export async function signOut(): Promise<Record<string, unknown>> {
  const s = await load();
  s.account = null;
  await writeJson(FILE, s);
  return status(s);
}

export async function history(limit = 50): Promise<Movement[]> {
  return (await load()).credits.slice(-limit).reverse();
}

function status(s: Stored): Record<string, unknown> {
  const acc = s.account;
  return {
    signed_in: acc !== null,
    provider: acc?.provider ?? null,
    email: acc?.email ?? null,
    name: acc?.name ?? null,
    credits: s.credits.reduce((n, m) => n + m.delta, 0),
    // Said plainly, because the difference matters the moment money is involved.
    enforced: false,
  };
}

export async function currentStatus(): Promise<Record<string, unknown>> {
  return status(await load());
}

export async function account(): Promise<Stored['account']> {
  return (await load()).account;
}
