import { spawnSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { AppConfig, BookingRequest, RankedResult } from './types';

const ROOT = resolve(__dirname, '..');

function loadTemplate(name: string): string {
  return readFileSync(resolve(ROOT, 'prompts', name), 'utf8');
}

function loadMemory(filePath: string): string {
  const full = resolve(ROOT, filePath);
  if (!existsSync(full)) return '(no memory yet)';
  const content = readFileSync(full, 'utf8').trim();
  return content || '(no memory yet)';
}

function escapeForAdb(text: string): string {
  // ADB input text needs spaces escaped as %s and special chars handled
  return text.replace(/ /g, '%s').replace(/'/g, "\\'");
}

export function buildSubAgentPrompt(app: AppConfig, request: BookingRequest): string {
  const template = loadTemplate('sub-agent.md');
  const memory = loadMemory(app.memoryFilePath);

  return template
    .replace(/{{APP_NAME}}/g, app.appName)
    .replace(/{{APP_ID}}/g, app.appId)
    .replace(/{{EMULATOR_SERIAL}}/g, app.emulatorSerial)
    .replace(/{{PICKUP}}/g, request.pickup.address)
    .replace(/{{PICKUP_ESCAPED}}/g, escapeForAdb(request.pickup.address))
    .replace(/{{DROPOFF}}/g, request.dropoff.address)
    .replace(/{{DROPOFF_ESCAPED}}/g, escapeForAdb(request.dropoff.address))
    .replace(/{{PASSENGERS}}/g, String(request.passengers ?? 1))
    .replace(/{{MEMORY_CONTENT}}/g, memory);
}

export function buildMainPrompt(request: BookingRequest, apps: AppConfig[]): string {
  const mainTemplate = loadTemplate('main-agent.md');
  const subAgentTemplate = loadTemplate('sub-agent.md');

  // Build the sub-agent prompt template (with placeholders still intact)
  // The main agent will fill in per-app values
  const appConfigsJson = JSON.stringify(
    apps.map(a => ({
      appName: a.appName,
      appId: a.appId,
      emulatorSerial: a.emulatorSerial,
      snapshotName: a.snapshotName,
      notes: a.notes,
      memoryFilePath: a.memoryFilePath,
    })),
    null,
    2
  );

  return mainTemplate
    .replace('{{PICKUP}}', request.pickup.address)
    .replace('{{DROPOFF}}', request.dropoff.address)
    .replace('{{PASSENGERS}}', String(request.passengers ?? 1))
    .replace('{{PRIORITY}}', request.constraints.priority)
    .replace('{{APP_CONFIGS_JSON}}', appConfigsJson)
    .replace('{{SUB_AGENT_PROMPT_TEMPLATE}}', subAgentTemplate);
}

export function invokeClaudeCode(prompt: string, timeoutMs = 180_000): string {
  console.log('Invoking Claude Code...');

  const result = spawnSync(
    'claude',
    ['--print', '--dangerously-skip-permissions', '-p', prompt],
    {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024, // 50MB — sub-agent outputs can be large
      cwd: ROOT,
    }
  );

  if (result.error) {
    throw new Error(`Claude Code invocation failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr || '';
    throw new Error(`Claude Code exited with code ${result.status}. Stderr: ${stderr.slice(0, 500)}`);
  }

  return result.stdout || '';
}

export function parseResults(output: string): RankedResult[] {
  // Extract content between <RESULTS>...</RESULTS>
  const match = output.match(/<RESULTS>([\s\S]*?)<\/RESULTS>/);
  if (!match) {
    console.error('No <RESULTS> block found in Claude output. Raw output tail:');
    console.error(output.slice(-2000));
    return [];
  }

  try {
    const parsed = JSON.parse(match[1].trim());
    if (!Array.isArray(parsed)) {
      console.error('Results is not an array:', parsed);
      return [];
    }
    return parsed as RankedResult[];
  } catch (e) {
    console.error('Failed to parse results JSON:', e);
    console.error('Raw results block:', match[1]);
    return [];
  }
}
