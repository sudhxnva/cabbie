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
import { BookingRequest, RankedResult } from "./types";

export async function orchestrate(
  request: BookingRequest,
  // optional hook that will be called multiple times during the run; the
  // Alexa gateway passes a wrapper that sends setAlexaReminder.  the
  // callback is best‑effort – failures should not abort the overall
  // orchestration.
  notify?: (message: string) => Promise<void>,
): Promise<RankedResult[]> {
  console.log("=".repeat(60));
  console.log("Cabbie Orchestration");
  console.log("=".repeat(60));
  console.log(`Pickup:   ${request.pickup.address}`);
  console.log(`Dropoff:  ${request.dropoff.address}`);
  console.log(`Priority: ${request.constraints.priority}`);
  console.log("=".repeat(60));

  console.log("\nFetching app configurations from database...");
  const allApps = await getAppConfigs(request.userId);
  const apps = allApps;
  console.log(`Testing with: ${apps.map(a => a.appName).join(", ")}`);

  console.log("\nChecking connected devices...");
  const devices = await getConnectedDevices();
  console.log("Connected:", devices.length ? devices.join(", ") : "none");

  const missingApps = apps.filter(a => !devices.includes(a.emulatorSerial));
  if (missingApps.length > 0) {
    console.log(
      `\nLaunching missing emulators: ${missingApps.map(a => a.emulatorSerial).join(", ")}`,
    );
    await Promise.all(
      missingApps.map(a =>
        launchEmulator(a.avdName, a.emulatorSerial).catch(e => {
          console.warn(
            `  Failed to launch ${a.appName} emulator: ${(e as Error).message}`,
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
      `Warning: Could not start emulators: ${stillMissing.map(a => a.emulatorSerial).join(", ")}`,
    );
    console.warn("Proceeding without them — sub-agents will report errors.\n");
  }

  console.log("\nRestoring emulator snapshots...");
  for (const app of apps) {
    if (!allDevices.includes(app.emulatorSerial)) continue;
    try {
      await restoreSnapshot(app.emulatorSerial, app.snapshotName);
    } catch (e) {
      console.warn(
        `  Snapshot restore failed for ${app.appName}, continuing anyway`,
      );
    }
  }

  console.log("\nWaiting for emulators to boot...");
  await Promise.all(
    apps
      .filter(a => allDevices.includes(a.emulatorSerial))
      .map(a =>
        waitForBoot(a.emulatorSerial).catch(() => {
          console.warn(`  ${a.emulatorSerial} boot wait timed out, continuing`);
        }),
      ),
  );

  console.log("\nLaunching cab apps...");
  for (const app of apps) {
    if (!allDevices.includes(app.emulatorSerial)) continue;
    try {
      await launchApp(app.emulatorSerial, app.appId);
    } catch (e) {
      console.warn(
        `  Failed to launch ${app.appName}: ${(e as Error).message}`,
      );
    }
  }

  // Filter out apps that are outside their service hours/area
  const availableApps = apps.filter(app => {
    const { available, reason } = checkAvailability(app);
    if (!available) {
      console.warn(`  Skipping ${app.appName}: ${reason}`);
    }
    return available;
  });

  if (availableApps.length === 0) {
    console.warn("\nNo apps are currently available.");
    return [];
  }

  console.log("\nRunning sub-agents (this may take 2-3 minutes)...\n");
  const results = await Promise.all(
    availableApps.map(async app => {
      const res = await runSubAgent(app, request);
      if (notify) {
        try {
          if (res.success && res.options.length) {
            const cheapest = res.options.reduce((a, b) =>
              a.priceMin && b.priceMin ? (a.priceMin < b.priceMin ? a : b) : a,
            );
            await notify(
              `Saw result from ${res.appName}: cheapest option is ${cheapest.price}`,
            );
          } else if (!res.success) {
            await notify(`Agent for ${res.appName} failed: ${res.error || 'unknown'}`);
          }
        } catch (e) {
          console.warn('[orchestrator] notify hook failed', (e as Error).message);
        }
      }
      return res;
    }),
  );

  const ranked = rankResults(results, request.constraints.priority);

  if (ranked.length === 0) {
    console.warn(
      "\nNo results returned. Check screenshots/ directory for debugging.",
    );
    results.forEach(r => {
      if (!r.success) console.error(`  ${r.appName}: ${r.error}`);
    });
    return [];
  }

  // final summary notification if desired
  if (notify && ranked.length) {
    try {
      const best = ranked[0];
      await notify(
        `Finished search – cheapest overall is ${best.appName} ${best.name} for ${best.price}`,
      );
    } catch (e) {
      console.warn('[orchestrator] final notify hook failed', (e as Error).message);
    }
  }

  return ranked;
}
