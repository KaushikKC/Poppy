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
import * as memory from './memory_store';
import * as boundaries from './boundaries';
import * as safety from './safety';
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

  // ── memory (§5: visible, editable, deletable) ─────────────────────────────
  route('GET', '/memory', async () => {
    const profile = await companion.profile();
    memory.setCharacter(profile.character);
    return ok({
      records: await memory.records(),
      suppressed: await memory.suppressedCategories(),
    });
  });

  route('POST', '/memory/confirm', async (req): Promise<Res> => {
    const b = (req.body ?? {}) as {
      text?: string;
      category?: memory.Category;
      why?: string;
      sensitive?: boolean;
    };
    const rec = await memory.remember(b.text ?? '', b.category ?? 'ongoing', b.why ?? null,
      Boolean(b.sensitive));
    return ok({ saved: rec !== null, record: rec });
  });

  route('POST', '/memory/update', async (req): Promise<Res> => {
    const b = (req.body ?? {}) as { id?: string; text?: string };
    return ok({ record: await memory.update(b.id ?? '', b.text ?? '') });
  });

  route('POST', '/memory/delete', async (req): Promise<Res> => {
    const b = (req.body ?? {}) as { id?: string };
    return ok({ deleted: await memory.remove(b.id ?? '') });
  });

  route('POST', '/memory/suppress', async (req): Promise<Res> => {
    const b = (req.body ?? {}) as { category?: memory.Category };
    if (b.category) await memory.suppressCategory(b.category);
    return ok({ suppressed: await memory.suppressedCategories() });
  });

  route('POST', '/memory/forget-all', async () => {
    await memory.forgetAll();
    return ok({ forgotten: true });
  });

  // ── standing rules ────────────────────────────────────────────────────────
  route('GET', '/boundaries', async () => ok(await boundaries.get()));

  route('POST', '/boundaries', async (req): Promise<Res> => {
    const b = (req.body ?? {}) as { kind?: 'avoid' | 'always'; topic?: string; remove?: boolean };
    const kind = b.kind === 'always' ? 'always' : 'avoid';
    if (!b.topic) return ok(await boundaries.get());
    return ok(b.remove
      ? await boundaries.remove(kind, b.topic)
      : await boundaries.add(kind, b.topic));
  });

  // The safety resources, so the UI can show the card without a turn.
  route('GET', '/safety/resources', () => ok({ resources: safety.CRISIS_RESOURCES }));
}
