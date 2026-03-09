import Adb, { Device } from '@devicefarmer/adbkit';
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { ts } from './log';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// Emulator binary path - configurable via environment variables
// Priority: EMULATOR_BINARY_PATH env var > ANDROID_HOME/emulator/emulator > default
const getEmulatorBinary = (): string => {
  if (process.env.EMULATOR_BINARY_PATH) {
    return process.env.EMULATOR_BINARY_PATH;
  }
  if (process.env.ANDROID_HOME) {
    return path.join(process.env.ANDROID_HOME, 'emulator', 'emulator');
  }
  // Fallback - will only work on systems with default Android SDK location
  return path.join(os.homedir(), 'Library', 'Android', 'sdk', 'emulator', 'emulator');
};

const EMULATOR_BINARY = getEmulatorBinary();

const client = Adb.createClient();

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString().trim()));
    stream.on('error', reject);
  });
}

// Send a command to the emulator console via TCP (port = serial number, e.g. emulator-5554 → 5554)
// Handles the auth handshake required by modern Android emulators.
async function emulatorConsoleCommand(serial: string, command: string): Promise<void> {
  const port = parseInt(serial.replace('emulator-', ''), 10);
  const tokenPath = path.join(os.homedir(), '.emulator_console_auth_token');

  let authToken: string | null = null;
  try {
    authToken = fs.readFileSync(tokenPath, 'utf8').trim();
  } catch {
    // Older emulators don't require auth
  }

  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    sock.setTimeout(30_000);

    let buffer = '';
    // States: 'banner' → 'auth' → 'command' → 'done'
    let state: 'banner' | 'auth' | 'command' | 'done' = 'banner';

    sock.connect(port, '127.0.0.1');

    sock.on('data', (data: Buffer) => {
      buffer += data.toString();

      if (state === 'banner' && buffer.includes('OK')) {
        buffer = '';
        if (authToken) {
          state = 'auth';
          sock.write(`auth ${authToken}\n`);
        } else {
          state = 'command';
          sock.write(`${command}\n`);
        }
      } else if (state === 'auth' && buffer.includes('OK')) {
        buffer = '';
        state = 'command';
        sock.write(`${command}\n`);
      } else if (state === 'auth' && buffer.includes('KO')) {
        sock.destroy();
        reject(new Error(`Emulator auth failed for ${serial}`));
      } else if (state === 'command') {
        if (buffer.includes('OK')) {
          state = 'done';
          sock.destroy();
          resolve();
        } else if (buffer.includes('KO')) {
          sock.destroy();
          reject(new Error(`Emulator command failed: ${buffer.trim()}`));
        }
      }
    });

    sock.on('error', reject);
    sock.on('timeout', () => {
      sock.destroy();
      reject(new Error(`Emulator console timeout for ${serial}`));
    });
  });
}

export async function restoreSnapshot(serial: string, snapshotName: string): Promise<void> {
  console.log(`${ts()}   [${serial}] Restoring snapshot '${snapshotName}'...`);
  await emulatorConsoleCommand(serial, `avd snapshot load ${snapshotName}`);
  console.log(`${ts()}   [${serial}] Snapshot restored.`);
}

// Launch an AVD in the background. The port is derived from the expected serial
// (e.g. emulator-5554 → -port 5554). Returns once the serial appears in adb devices.

export async function launchEmulator(
  avdName: string,
  expectedSerial: string,
  timeoutMs = 120_000
): Promise<void> {
  const port = parseInt(expectedSerial.replace('emulator-', ''), 10);
  console.log(`${ts()}   Launching AVD '${avdName}' on port ${port}...`);

  const isDebug = process.env.DEBUG === 'true';
  const args = ['-avd', avdName, '-port', String(port), '-no-snapshot-save'];
  if (!isDebug) {
    args.push('-no-window', '-gpu', 'swiftshader_indirect');
  } else {
    // No window-position flag supported; windows will appear at default positions
  }

  const proc = spawn(EMULATOR_BINARY, args, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  proc.stderr?.on('data', (d: Buffer) => {
    const line = d.toString().trim();
    if (line) console.warn(`${ts()}   [emulator stderr] ${line}`);
  });
  proc.on('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`${ts()}   [${avdName}] emulator process exited with code ${code}`);
    }
  });
  proc.unref();

  // Wait until the serial appears in adb devices
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const devices = await getConnectedDevices();
    if (devices.includes(expectedSerial)) {
      console.log(`${ts()}   [${expectedSerial}] Emulator online.`);
      return;
    }
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for ${expectedSerial} to appear after launching '${avdName}'`);
}

export async function launchApp(serial: string, appId: string): Promise<void> {
  console.log(`${ts()}   [${serial}] Launching ${appId}...`);
  const device = client.getDevice(serial);
  const stream = await device.shell(`monkey -p ${appId} -c android.intent.category.LAUNCHER 1`);
  await readStream(stream);
}

export async function waitForBoot(serial: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  console.log(`${ts()}   [${serial}] Waiting for boot...`);
  const device = client.getDevice(serial);
  while (Date.now() - start < timeoutMs) {
    try {
      const stream = await device.shell('getprop sys.boot_completed');
      const val = await readStream(stream);
      if (val === '1') {
        console.log(`${ts()}   [${serial}] Boot complete.`);
        return;
      }
    } catch {
      // Device not ready yet, keep polling
    }
    await sleep(2000);
  }
  throw new Error(`[${serial}] Timed out waiting for boot after ${timeoutMs}ms`);
}

export async function getConnectedDevices(): Promise<string[]> {
  const devices = await client.listDevices();
  return devices.filter((d: Device) => d.type === 'device').map((d: Device) => d.id);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
