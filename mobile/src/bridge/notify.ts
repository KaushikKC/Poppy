/**
 * The daily reminder, scheduled with the operating system.
 *
 * The page used to do this with `setTimeout` and the browser Notification API, and it
 * could never have worked on a phone. A timer only lives while the WebView does, and
 * iOS suspends and then kills a backgrounded app — so a reminder set for 9pm died the
 * moment the app went to the background, and could only fire if the app happened to be
 * open at that exact minute. `window.Notification` at a `file://` origin was never
 * granted either, so the code silently did nothing twice over.
 *
 * Handing the trigger to `UNUserNotificationCenter` (through Notifee) means the OS
 * holds it. It fires whether the app is running, backgrounded, or closed.
 *
 * ## The text is fixed when it is scheduled, not when it fires
 *
 * A scheduled notification carries its words with it, so the live nudge from
 * `nudges.py` cannot be used — that text is chosen at the moment of sending, from how
 * long it has been and what is open. What is scheduled here has to be written in
 * advance and stay true whenever it lands.
 *
 * Which makes the guilt guard this module's problem rather than the backend's. nudges
 * and billing both make a guilt trip impossible in code; a line frozen weeks earlier
 * has to be safe on its own. So it is an invitation and never a reproach: no counting
 * of days missed, no "you haven't", no question that only has one right answer. The
 * real nudge is fetched when the app opens.
 */

import notifee, {
  AndroidImportance,
  AuthorizationStatus,
  RepeatFrequency,
  TriggerType,
} from '@notifee/react-native';

/** One id, reused. Setting a new time replaces the old reminder rather than stacking. */
const RITUAL_ID = 'poppys-ritual';

export type Ritual = { kind: string | null; time: string | null; name?: string };

/**
 * Ask for permission, at the moment the user sets a reminder.
 *
 * Deliberately not at launch. A permission prompt before anyone has asked for anything
 * is the one most people deny, and iOS only lets you ask once.
 */
export async function requestPermission(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  return (
    settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
    settings.authorizationStatus === AuthorizationStatus.PROVISIONAL
  );
}

/** Words that are still true whenever they land. See the note above on the guilt guard. */
function lineFor(kind: string | null, name: string): { title: string; body: string } {
  const who = name || 'Poppy';
  if (kind === 'morning') return { title: who, body: 'Morning. Here whenever you want to talk.' };
  if (kind === 'evening' || kind === 'night' || kind === 'wind') {
    return { title: who, body: 'Winding down. I am around if you feel like talking.' };
  }
  return { title: who, body: 'Here whenever you want to talk.' };
}

/**
 * Schedule the daily reminder, replacing whatever was there.
 *
 * Returns false when there is nothing to schedule or permission was refused, so the
 * page can say so rather than showing a reminder that will never arrive.
 */
export async function scheduleRitual({ kind, time, name = '' }: Ritual): Promise<boolean> {
  await cancelRitual();
  if (!kind || !time || !/^\d{2}:\d{2}$/.test(time)) return false;
  if (!(await requestPermission())) return false;

  const [h, m] = time.split(':').map(Number);
  const next = new Date();
  next.setHours(h, m, 0, 0);
  // A time already past today means tomorrow. Scheduling in the past is the one thing
  // the trigger refuses outright.
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);

  const { title, body } = lineFor(kind, name);
  const channelId = await notifee.createChannel({
    id: 'ritual',
    name: 'Daily time',
    importance: AndroidImportance.DEFAULT,
  });

  await notifee.createTriggerNotification(
    {
      id: RITUAL_ID,
      title,
      body,
      ios: { sound: 'default' },
      android: { channelId, pressAction: { id: 'default' } },
    },
    {
      type: TriggerType.TIMESTAMP,
      timestamp: next.getTime(),
      repeatFrequency: RepeatFrequency.DAILY,
    },
  );
  return true;
}

/** Remove it. Called when the ritual is cleared or its time changes. */
export async function cancelRitual(): Promise<void> {
  try {
    await notifee.cancelTriggerNotification(RITUAL_ID);
  } catch {
    // Nothing scheduled, which is the same outcome.
  }
}
