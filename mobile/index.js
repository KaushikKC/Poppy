/**
 * @format
 *
 * Two entry points live in this project.
 *
 *   AppShell  — the real app: the desktop web UI in a WebView, driven by the
 *               TypeScript core through the bridge. This is what ships.
 *   App       — the M0 engine spike: the measurement harness that proved the
 *               three engines run on device and timed mic-stop to first-audio.
 *               Kept because it is the only place those numbers can be read.
 *
 * Set POPPYS_SPIKE=1 in the environment before starting metro to boot the
 * harness instead of the app.
 */

import { AppRegistry } from 'react-native';
import { name as appName } from './app.json';

const useSpike = process.env.POPPYS_SPIKE === '1';

AppRegistry.registerComponent(appName, () =>
  useSpike ? require('./App').default : require('./src/AppShell').default,
);
