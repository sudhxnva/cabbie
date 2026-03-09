import { randomUUID } from "crypto";
import { getAppConfigs } from "../config/hardcoded";
import {
  restoreSnapshot,
  launchApp,
  launchEmulator,
  waitForBoot,
  getConnectedDevices,
  sleep,
} from "./emulator";
import { runSubAgent, rankResults } from "./claude";
import { checkAvailability } from "./availability";
import { geocodeAddress } from "./geocode";
import { buildDeepLinkUri } from "./deeplink";
import { BookingRequest, RankedResult } from "./types";
import { storeSession } from "./sessions";
import { ts } from "./log";

export interface OrchestrateResult {
  sessionId: string;
  results: RankedResult[];
}

export async function orchestrate(
  request: BookingRequest,
): Promise<OrchestrateResult> {
  console.log("=".repeat(60));
  console.log("Cabbie Orchestration");
  console.log("=".repeat(60));
  console.log(`Pickup:   ${request.pickup.address}`);
  console.log(`Dropoff:  ${request.dropoff.address}`);
  console.log(`Priority: ${request.constraints.priority}`);
  console.log("=".repeat(60));

  console.log(`\n${ts()} Fetching app configurations from database...`);
  const allApps = await getAppConfigs(request.userId);
  const apps = allApps;
  console.log(`${ts()} Testing with: ${apps.map(a => a.appName).join(", ")}`);

  console.log(`\n${ts()} Checking connected devices...`);
  const devices = await getConnectedDevices();
  console.log(`${ts()} Connected: ${devices.length ? devices.join(", ") : "none"}`);

  const missingApps = apps.filter(a => !devices.includes(a.emulatorSerial));
  if (missingApps.length > 0) {
    console.log(
      `\n${ts()} Launching missing emulators: ${missingApps.map(a => a.emulatorSerial).join(", ")}`,
    );
    await Promise.all(
      missingApps.map(a =>
        launchEmulator(a.avdName, a.emulatorSerial).catch(e => {
          console.warn(
            `${ts()} Failed to launch ${a.appName} emulator: ${(e as Error).message}`,
          );
        }),
      ),
    );
  }

  // Refresh device list after launching
  const allDevices = await getConnectedDevices();
  const stillMissing = apps.filter(a => !allDevices.includes(a.emulatorSerial));
  if (stillMissing.length > 0) {
    console.warn(
      `${ts()} Warning: Could not start emulators: ${stillMissing.map(a => a.emulatorSerial).join(", ")}`,
    );
    console.warn(`${ts()} Proceeding without them — sub-agents will report errors.\n`);
  }

  console.log(`\n${ts()} Restoring emulator snapshots...`);
  for (const app of apps) {
    if (!allDevices.includes(app.emulatorSerial)) continue;
    try {
      await restoreSnapshot(app.emulatorSerial, app.snapshotName);
    } catch (e) {
      console.warn(
        `${ts()} Snapshot restore failed for ${app.appName}, continuing anyway`,
      );
    }
  }

  console.log(`\n${ts()} Waiting for emulators to boot...`);
  await Promise.all(
    apps
      .filter(a => allDevices.includes(a.emulatorSerial))
      .map(a =>
        waitForBoot(a.emulatorSerial).catch(() => {
          console.warn(`${ts()} ${a.emulatorSerial} boot wait timed out, continuing`);
        }),
      ),
  );

  console.log(`\n${ts()} Launching cab apps...`);
  for (const app of apps) {
    if (!allDevices.includes(app.emulatorSerial)) continue;
    try {
      await launchApp(app.emulatorSerial, app.appId);
    } catch (e) {
      console.warn(
        `${ts()} Failed to launch ${app.appName}: ${(e as Error).message}`,
      );
    }
  }

  // Filter out apps that are outside their service hours/area
  const availableApps = apps.filter(app => {
    const { available, reason } = checkAvailability(app);
    if (!available) {
      console.warn(`${ts()} Skipping ${app.appName}: ${reason}`);
    }
    return available;
  });

  if (availableApps.length === 0) {
    console.warn(`\n${ts()} No apps are currently available.`);
    return { sessionId: randomUUID(), results: [] };
  }

  // Geocode addresses once (shared across all agents) and build per-app deep links
  const deepLinkUris = new Map<string, string | null>();
  try {
    console.log(`\n${ts()} Geocoding addresses...`);
    const [pickupCoords, dropoffCoords] = await Promise.all([
      geocodeAddress(request.pickup.address),
      geocodeAddress(request.dropoff.address),
    ]);
    console.log(`${ts()}   Pickup:  ${pickupCoords.lat.toFixed(5)}, ${pickupCoords.lng.toFixed(5)}`);
    console.log(`${ts()}   Dropoff: ${dropoffCoords.lat.toFixed(5)}, ${dropoffCoords.lng.toFixed(5)}`);

    for (const app of availableApps) {
      const uri = buildDeepLinkUri(app.appId, {
        pickup: pickupCoords,
        pickupAddress: request.pickup.address,
        dropoff: dropoffCoords,
        dropoffAddress: request.dropoff.address,
      });
      deepLinkUris.set(app.appId, uri);
      console.log(`${ts()}   [${app.appName}] deep link: ${uri ? 'ready' : 'not supported'}`);
    }
  } catch (e) {
    console.warn(`${ts()} Geocoding failed: ${(e as Error).message} — deep links disabled, using UI navigation`);
    for (const app of availableApps) deepLinkUris.set(app.appId, null);
  }

  console.log(`\n${ts()} Running sub-agents (this may take 2-3 minutes)...\n`);
  const results = await Promise.all(
    availableApps.map(app => runSubAgent(app, request, deepLinkUris.get(app.appId) ?? null)),
  );

  const ranked = rankResults(results, request.constraints.priority);

  if (ranked.length === 0) {
    console.warn(
      `\n${ts()} No results returned. Check screenshots/ directory for debugging.`,
    );
    results.forEach(r => {
      if (!r.success) console.error(`${ts()}   ${r.appName}: ${r.error}`);
    });
  }

  const sessionId = randomUUID();
  await storeSession({
    sessionId,
    request,
    apps: availableApps,
    rankedResults: ranked,
    createdAt: new Date(),
  });

  return { sessionId, results: ranked };
}
