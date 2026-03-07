import { getAppConfigs } from '../config/hardcoded';
import { restoreSnapshot, launchApp, waitForBoot, getConnectedDevices, sleep } from './emulator';
import { buildMainPrompt, invokeClaudeCode, parseResults } from './claude';
import { BookingRequest, RankedResult } from './types';

export async function orchestrate(request: BookingRequest): Promise<RankedResult[]> {
  console.log('='.repeat(60));
  console.log('Cabbie Orchestration');
  console.log('='.repeat(60));
  console.log(`Pickup:   ${request.pickup.address}`);
  console.log(`Dropoff:  ${request.dropoff.address}`);
  console.log(`Priority: ${request.constraints.priority}`);
  console.log('='.repeat(60));

  // Fetch app configs from DB
  console.log('\nFetching app configurations from database...');
  const apps = await getAppConfigs(request.userId);
  console.log(`Found ${apps.length} active app configurations.`);

  // Verify emulators are reachable
  console.log('\nChecking connected devices...');
  const devices = getConnectedDevices();
  console.log('Connected:', devices.length ? devices.join(', ') : 'none');

  const missingDevices = apps.filter(a => !devices.includes(a.emulatorSerial));
  if (missingDevices.length > 0) {
    console.warn(
      `Warning: These emulators are not connected: ${missingDevices.map(a => a.emulatorSerial).join(', ')}`
    );
    console.warn('Proceeding anyway — Claude sub-agents will report errors for unreachable devices.\n');
  }

  // Restore snapshots and launch apps
  console.log('\nRestoring emulator snapshots...');
  for (const app of apps) {
    if (!devices.includes(app.emulatorSerial)) continue;
    try {
      restoreSnapshot(app.emulatorSerial, app.snapshotName);
    } catch (e) {
      console.warn(`  Snapshot restore failed for ${app.appName}, continuing anyway`);
    }
  }

  // Wait for emulators to be fully booted after snapshot restore
  console.log('\nWaiting for emulators to boot...');
  await Promise.all(
    apps
      .filter(a => devices.includes(a.emulatorSerial))
      .map(a => waitForBoot(a.emulatorSerial).catch(() => {
        console.warn(`  ${a.emulatorSerial} boot wait timed out, continuing`);
      }))
  );

  // Launch cab apps
  console.log('\nLaunching cab apps...');
  for (const app of apps) {
    if (!devices.includes(app.emulatorSerial)) continue;
    try {
      launchApp(app.emulatorSerial, app.appId);
    } catch (e) {
      console.warn(`  Failed to launch ${app.appName}: ${(e as Error).message}`);
    }
  }

  // Wait for app home screens to fully load
  console.log('\nWaiting 5s for app home screens to load...');
  await sleep(5000);

  // Build the main agent prompt
  console.log('\nBuilding orchestrator prompt...');
  const prompt = buildMainPrompt(request, apps);

  // Invoke Claude Code
  console.log('\nInvoking Claude Code (this may take 2-3 minutes)...\n');
  let output: string;
  try {
    output = invokeClaudeCode(prompt);
  } catch (e) {
    console.error('Claude Code invocation failed:', (e as Error).message);
    throw e;
  }

  // Parse results
  console.log('\nParsing results...');
  const results = parseResults(output);

  if (results.length === 0) {
    console.error('\nNo results returned. Check screenshots/ directory for debugging.');
  }

  return results;
}
