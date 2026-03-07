import { execSync, spawnSync } from 'child_process';

function adb(serial: string, args: string): string {
  const result = spawnSync('adb', ['-s', serial, ...args.split(' ')], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  return (result.stdout || '').trim();
}

export function restoreSnapshot(serial: string, snapshotName: string): void {
  console.log(`  [${serial}] Restoring snapshot '${snapshotName}'...`);
  // Send emu avd snapshot load command via adb emu
  const result = spawnSync('adb', ['-s', serial, 'emu', 'avd', 'snapshot', 'load', snapshotName], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (result.error) {
    console.warn(`  [${serial}] Snapshot restore warning: ${result.error.message}`);
  }
}

export function launchApp(serial: string, appId: string): void {
  console.log(`  [${serial}] Launching ${appId}...`);
  adb(serial, `shell monkey -p ${appId} -c android.intent.category.LAUNCHER 1`);
}

export async function waitForBoot(serial: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  console.log(`  [${serial}] Waiting for boot...`);
  while (Date.now() - start < timeoutMs) {
    const val = adb(serial, 'shell getprop sys.boot_completed');
    if (val === '1') {
      console.log(`  [${serial}] Boot complete.`);
      return;
    }
    await sleep(2000);
  }
  throw new Error(`[${serial}] Timed out waiting for boot after ${timeoutMs}ms`);
}

export function getConnectedDevices(): string[] {
  const result = spawnSync('adb', ['devices'], { encoding: 'utf8' });
  const lines = (result.stdout || '').split('\n').slice(1); // skip "List of devices attached"
  return lines
    .filter(l => l.includes('\tdevice'))
    .map(l => l.split('\t')[0].trim());
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
