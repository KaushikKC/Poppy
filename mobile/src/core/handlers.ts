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
import * as streak from './streak';
import * as garden from './garden';
import * as quests from './quests';
import * as bloom from './bloom';
import * as loops from './loops';
import * as ritual from './ritual';
import * as extract from './memory_extract';
import * as author from './loop_author';
import * as personas from './personas';
import * as opening from './opening';
import * as nudges from './nudges';
import * as billing from './billing';
import * as tone from './tone';
import { CAST } from './characters';
import { ok, route, type Res } from './router';

/**
 * detection is false because voice-based emotion and accent classifiers are not
 * shipped on iOS: they are ~1.1GB for a feature that is off by default on desktop.
 * Reported honestly rather than offering a toggle that would do nothing.
 */
export const SETTINGS = { detection: false, detection_available: tone.DETECTION_AVAILABLE, avatar: '3d' };

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

  // The methods the UI actually uses. I first wrote these as POST /memory/update
  // and /memory/delete, which no caller in frontend/memory.js ever sends: it uses
  // PATCH and DELETE on /memory/:id, and DELETE /memory to forget everything.
  // Because the UI wraps these in .catch(), the mismatch would not have raised
  // anything — edit and delete would simply have done nothing.
  route('PATCH', '/memory/:id', async (req): Promise<Res> => {
    const b = (req.body ?? {}) as { text?: string };
    return ok({ record: await memory.update(req.query.id, b.text ?? '') });
  });

  route('DELETE', '/memory/:id', async (req): Promise<Res> =>
    ok({ deleted: await memory.remove(req.query.id) }),
  );

  route('POST', '/memory/suppress', async (req): Promise<Res> => {
    const b = (req.body ?? {}) as { category?: memory.Category };
    if (b.category) await memory.suppressCategory(b.category);
    return ok({ suppressed: await memory.suppressedCategories() });
  });

  route('DELETE', '/memory', async () => {
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

  // ── the home screen ───────────────────────────────────────────────────────
  // Everything it needs in one call: who she is, the single open loop in her own
  // voice, and the streak. The strip is her line rather than an app notice,
  // because the pull only works if it reads as her talking.
  route('GET', '/home', async () => {
    const profile = await companion.profile();
    memory.setCharacter(profile.character);

    const loop = await loops.top();
    let remembers = loops.surfaceText(loop);
    if (!remembers) {
      const facts = await memory.recall();
      if (facts.length) remembers = `I remember: ${facts[facts.length - 1]}`;
    }

    return ok({
      companion_name: profile.companion_name,
      character: profile.character,
      gender: profile.gender,
      vibe: profile.vibe,
      avatar: profile.avatar,
      remembers,
      closeness: await companion.closeness((await memory.records()).length),
      streak: await streak.status(),
      // Read once and cleared, so a spent freeze is a moment rather than a tally.
      freeze_notice: await streak.takeFreezeNotice(),
      current_streak: profile.current_streak ?? 0,
      total_calls: profile.total_calls ?? 0,
      ritual_kind: profile.ritual_kind ?? null,
      ritual_time: profile.ritual_time ?? null,
    });
  });

  // ── the call ──────────────────────────────────────────────────────────────
  route('POST', '/call/open', async (req): Promise<Res> => {
    const b = (req.body ?? {}) as { seed?: string; mode?: string; source?: string };
    const profile = await companion.profile();
    await billing.recordCall();
    memory.setCharacter(profile.character);

    const loop = await loops.top();
    if (loop) await loops.markSurfaced(loop.id);

    // A streak worth remarking on gets a genuine beat rather than a badge. Only on
    // round numbers, so it stays a moment instead of a running commentary.
    const current = profile.current_streak ?? 0;
    const milestone =
      current >= 365 || current === 7 || current === 30 || current === 100 ? current : null;

    // Composed rather than canned: time of day, their name, the mood they picked,
    // and the hook she left last time.
    const line = await opening.compose({
      seed: b.seed ?? null,
      mode: b.mode ?? null,
      milestone,
      loop,
    });

    return ok({
      opening: line,
      profile,
      milestone,
      callback_offered: false,
      surfaced_loop_id: loop?.id ?? null,
      level_up: await bloom.takeLevelUp(),
    });
  });

  route('POST', '/call/close', async (req): Promise<Res> => {
    const b = (req.body ?? {}) as {
      duration?: number;
      turns?: Array<{ role?: string; content?: string }>;
      surfaced_loop_id?: string;
      saved_memory?: boolean;
      edited_memory?: boolean;
      mood_new?: boolean;
      mode?: string;
    };
    const turns = b.turns ?? [];
    const duration = Number(b.duration ?? 0);
    const profile0 = await companion.profile();
    const spoke = turns.some((t) => t.role === 'user');

    // Meaningful means something real happened, not merely that time passed.
    const meaningful = duration >= streak.MIN_CALL_SECONDS && spoke;

    if (b.surfaced_loop_id && spoke) await loops.resolve(b.surfaced_loop_id);

    const signals = {
      loop_resolved: Boolean(b.surfaced_loop_id && spoke),
      call_5min: duration >= 300,
      ritual_time: (await ritual.anchorNow()) !== null,
      good_thing: quests.detectGoodThing(turns),
      memory_saved: Boolean(b.saved_memory),
      memory_edited: Boolean(b.edited_memory),
      mood_new: Boolean(b.mood_new),
    };
    const newQuests = await quests.complete(signals);

    if (streak.qualifies(duration, newQuests.length > 0)) {
      await streak.recordActivity();
    }

    // A bud for turning up, a bloom for a call that had something in it.
    const flower = await garden.plant(b.mode ?? null, meaningful);
    if (meaningful) await bloom.award('call');
    for (const _ of newQuests) await bloom.award('quest');
    if (signals.loop_resolved) await bloom.award('loop_resolved');
    if (signals.ritual_time) await bloom.award('ritual_hit');

    const profile = await companion.profile();
    await companion.update({
      total_calls: (profile.total_calls ?? 0) + 1,
      last_call_date: new Date().toISOString(),
    });

    const ly = await streak.longYear();
    if (ly.reached) await garden.plantLongYear();

    // The pact, read from the whole call rather than only the last turn: she may
    // have asked mid-call and the answer arrived two turns later. Latest wins, so a
    // correction beats the first guess.
    let ritualSet: { kind: string; time: string; confirm: string } | null = null;
    if (!profile0.ritual_kind) {
      const pact = ritual.parseFromTurns(turns);
      if (pact && 'declined' in pact) {
        await ritual.decline();
      } else if (pact) {
        await ritual.set(pact.kind, pact.time);
        ritualSet = {
          kind: pact.kind,
          time: pact.time,
          confirm: ritual.confirmLine(pact.kind, pact.time),
        };
      }
    }

    // Plant the hook this call ends on. Without this nothing ever creates a loop,
    // and the home strip, slot 1 of the daily three and the outro card all fall
    // back forever. author() always returns something: a call with no unresolved
    // beat is the one outcome the design does not allow.
    // A call that landed on their own anchor also reinforces the cadence. It is the
    // weakest loop type on purpose, so it sits underneath rather than taking the one
    // visible slot from the conversation.
    const cadence = await ritual.closingLoop();
    if (cadence) await loops.add(cadence, 'ritual');

    const written = await author.author(turns);
    const planted = await loops.add(
      written.hook,
      written.type === 'reveal' ? 'reveal' : written.type,
      // A reveal is hers to give, so it arrives on its own later rather than the
      // instant the call ends.
      written.type === 'reveal' ? { dueInHours: 20 } : {},
    );

    // The hook for the outro card: what she just planted, in her voice.
    const next = planted ?? (await loops.top());

    return ok({
      ok: true,
      meaningful,
      open_loop: loops.surfaceText(next),
      loop_type: next?.type ?? null,
      ritual: ritualSet ?? {
        kind: profile.ritual_kind ?? null,
        time: profile.ritual_time ?? null,
      },
      streak: await streak.status(),
      rules_set: [],
      flower,
      quests_completed: newQuests,
      bloom: await bloom.status(),
    });
  });

  // ── the garden ────────────────────────────────────────────────────────────
  route('GET', '/garden', async () => ok(await garden.state()));

  route('POST', '/garden/arrange', async (req): Promise<Res> => {
    const b = (req.body ?? {}) as { positions?: Record<string, { x: number; y: number }> };
    return ok({ moved: await garden.arrange(b.positions ?? {}) });
  });

  route('POST', '/garden/label', async (req): Promise<Res> => {
    const b = (req.body ?? {}) as { id?: string; text?: string };
    return ok({ flower: await garden.label(b.id ?? '', b.text ?? '') });
  });

  route('GET', '/garden/year', async () => ok(await garden.yearInReview()));

  // ── streak, quests, points ────────────────────────────────────────────────
  route('GET', '/streak', async () => ok(await streak.status()));

  route('POST', '/streak/repair', async () => ok(await streak.repair()));

  route('GET', '/quests', async () => ok(await quests.status()));

  route('GET', '/bloom', async () => ok(await bloom.status()));

  route('GET', '/long-year', async () => ok(await streak.longYear()));

  // The daily layer the home screen posts to on open: quests plus points, in one.
  route('POST', '/daily-layer', async () => ok({
    quests: await quests.status(),
    bloom: await bloom.status(),
    streak: await streak.status(),
  }));

  // ── the ritual ────────────────────────────────────────────────────────────
  route('POST', '/ritual', async (req): Promise<Res> => {
    const b = (req.body ?? {}) as { kind?: string | null; time?: string };
    return ok(await ritual.set(b.kind ?? null, b.time));
  });

  route('GET', '/ritual/due', async () => {
    const d = await ritual.due();
    if (!d.due) return ok({ due: false });
    // Everything that pulls the user back passes the guilt guard, including this.
    const text = await nudges.composeNudge(d.kind);
    if (!text) return ok({ due: false }); // silence is a valid answer
    return ok({ due: true, kind: d.kind, text });
  });

  route('POST', '/ritual/dismiss', async () => {
    await ritual.dismiss();
    return ok({ ok: true });
  });

  // The nudge surface. Empty means say nothing: past the ladder, silence is the
  // message, and the UI has to treat it as silence rather than as copy.
  route('GET', '/nudge', async () => {
    const text = await nudges.composeNudge();
    return ok({ text: text || null });
  });

  // ── personality, entitlement, history ─────────────────────────────────────
  // No personality drift on mobile yet, so this reports nothing rather than
  // inventing a change the user never saw.
  route('GET', '/companion/personality', () => ok({ changed: false, note: null }));
  route('POST', '/companion/personality/accept', () => ok({ ok: true }));

  // Real plan logic, with the paywall off by default. See core/billing.ts: there is
  // no price and no StoreKit product yet, so a paywall would be a door with no
  // handle. The guardrail that matters is ported regardless — money is never
  // mentioned during a vulnerable moment.
  route('GET', '/entitlement', async () => ok(await billing.entitlement()));
  route('POST', '/entitlement', async (req): Promise<Res> => {
    const b = (req.body ?? {}) as { plan?: string };
    return ok(b.plan ? await billing.setPlan(b.plan) : await billing.entitlement());
  });

  route('DELETE', '/history', () => ok({ cleared: true }));

  // The model proposing what is worth remembering. Already saved by the time this
  // returns: the UI shows a receipt, not a permission prompt.
  route('POST', '/memory/extract', async (req): Promise<Res> => {
    const b = (req.body ?? {}) as { text?: string };
    const profile = await companion.profile();
    memory.setCharacter(profile.character);
    return ok({ saved: await extract.extractAndSave(b.text ?? '') });
  });

  // Updates arrive through the App Store on iOS, so there is nothing to check and
  // no reason to make a network request. Reporting "none" is the truth here, and
  // it keeps the promise that the app talks to nothing.
  route('GET', '/update', () => ok({
    version: null, available: false, latest: null, url: null, notice: null,
  }));
  route('POST', '/update/check', () => ok({ enabled: false }));

  route('GET', '/sessions', () => ok({ sessions: [] }));
  route('GET', '/personas', () => ok(personas.UI_LIST));
}
