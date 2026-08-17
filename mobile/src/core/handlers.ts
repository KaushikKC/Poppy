/**
 * Route handlers — the port of backend/main.py's endpoints.
 *
 * P1 registers only what the frontend touches while booting into onboarding:
 * /health, /settings, /companion, /characters. The remaining 41 endpoints arrive
 * with the modules behind them (P3 for memory and personas, P4 for the retention
 * engine), and tests/test_bridge.js reports the coverage gap each time so it stays
 * visible rather than being discovered by a blank screen on device.
 */

import * as companion from './companion';
import { CAST } from './characters';
import { ok, route, type Res } from './router';

/** Matches backend/config.py: detection off by default, local avatar. */
export const SETTINGS = { detection: false, avatar: '3d' };

export function registerHandlers(): void {
  route('GET', '/health', () => ok({ status: 'ok' }));

  route('GET', '/settings', () => ok(SETTINGS));

  route('GET', '/characters', () => ok(CAST));

  route('GET', '/companion', async () => ok(await companion.profile()));

  // Onboarding. Desktop accepts {character, seed}; seed belongs to the personality
  // pass, which is P3, so it is accepted and ignored rather than rejected.
  route('POST', '/companion', async (req): Promise<Res> => {
    const body = (req.body ?? {}) as { character?: string };
    return ok(await companion.create(body.character ?? 'poppy'));
  });

  route('POST', '/companion/character', async (req): Promise<Res> => {
    const body = (req.body ?? {}) as { character?: string };
    return ok(await companion.setCharacter(body.character ?? 'poppy'));
  });

  route('POST', '/companion/update', async (req): Promise<Res> =>
    ok(await companion.update((req.body ?? {}) as Partial<companion.Profile>)),
  );
}
