import { query } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { AppConfig, BookingRequest, PriceResult, RankedResult } from './types';

const ROOT = resolve(__dirname, '..');

const PriceResultSchema = {
  type: 'object',
  properties: {
    appName: { type: 'string' },
    success: { type: 'boolean' },
    error: { type: 'string' },
    options: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          price: { type: 'string' },
          priceMin: { type: 'number' },
          etaMinutes: { type: 'number' },
          category: {
            type: 'string',
            enum: ['standard', 'comfort', 'xl', 'luxury', 'eco', 'free'],
          },
        },
        required: ['name', 'price', 'etaMinutes', 'category'],
      },
    },
  },
  required: ['appName', 'success', 'options'],
};

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

export async function runSubAgent(app: AppConfig, request: BookingRequest): Promise<PriceResult> {
  const prompt = buildSubAgentPrompt(app, request);
  console.log(`  [${app.appName}] Starting sub-agent (device: ${app.emulatorSerial})...`);

  const stream = query({
    prompt,
    options: {
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      mcpServers: {
        adb: {
          command: '/opt/homebrew/bin/uv',
          args: ['--directory', '/Users/sudhanva/Documents/Personal/Code/android-mcp-server', 'run', 'server.py'],
          env: { ANDROID_DEVICE_SERIAL: app.emulatorSerial },
        },
      },
      allowedTools: ['mcp__adb__*', 'Read', 'Write'],
      outputFormat: {
        type: 'json_schema',
        schema: PriceResultSchema,
      },
      maxTurns: 100,
      cwd: ROOT,
    },
  });

  for await (const msg of stream) {
    if (msg.type === 'system' && msg.subtype === 'init') {
      console.log(`  [${app.appName}] Session init — model: ${msg.model}, tools: ${msg.tools.join(', ')}`);
      console.log(`  [${app.appName}] MCP servers: ${msg.mcp_servers.map(s => `${s.name}(${s.status})`).join(', ')}`);
    } else if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text.trim()) {
          console.log(`  [${app.appName}] 🤖 ${block.text.trim()}`);
        } else if (block.type === 'tool_use') {
          console.log(`  [${app.appName}] 🔧 ${block.name}(${JSON.stringify(block.input).slice(0, 120)})`);
        }
      }
    } else if (msg.type === 'user') {
      for (const block of msg.message.content) {
        if (typeof block === 'object' && 'type' in block && block.type === 'tool_result') {
          const content = Array.isArray(block.content)
            ? block.content.map((c: any) => (c.type === 'text' ? c.text : '[image]')).join('')
            : String(block.content ?? '');
          if (content.trim()) {
            console.log(`  [${app.appName}] ✅ tool_result: ${content.slice(0, 200)}`);
          }
        }
      }
    } else if (msg.type === 'result') {
      if (msg.subtype === 'success') {
        console.log(`  [${app.appName}] Sub-agent complete (${msg.num_turns} turns, $${msg.total_cost_usd.toFixed(4)})`);
        if (msg.structured_output) {
          return msg.structured_output as PriceResult;
        }
        try {
          return JSON.parse(msg.result) as PriceResult;
        } catch {
          return { appName: app.appName, success: false, error: 'Could not parse result', options: [] };
        }
      } else {
        const errors = msg.errors.join('; ');
        console.error(`  [${app.appName}] Sub-agent failed (${msg.subtype}): ${errors}`);
        return { appName: app.appName, success: false, error: `${msg.subtype}: ${errors}`, options: [] };
      }
    }
  }

  return { appName: app.appName, success: false, error: 'No result message received', options: [] };
}

export function rankResults(
  results: PriceResult[],
  priority: BookingRequest['constraints']['priority']
): RankedResult[] {
  const flat: RankedResult[] = results
    .filter(r => r.success)
    .flatMap(r => r.options.map(o => ({ ...o, appName: r.appName })));

  switch (priority) {
    case 'cheapest':
      return flat.sort((a, b) => (a.priceMin ?? Infinity) - (b.priceMin ?? Infinity));
    case 'fastest':
      return flat.sort((a, b) => a.etaMinutes - b.etaMinutes);
    case 'comfortable': {
      const order = ['comfort', 'standard', 'xl', 'luxury', 'eco', 'free'];
      return flat.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
    }
    case 'luxury': {
      const order = ['luxury', 'comfort', 'xl', 'standard', 'eco', 'free'];
      return flat.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
    }
    case 'eco':
      return flat.filter(r => r.category === 'eco');
    case 'free':
      return flat.filter(r => r.category === 'free');
    default:
      return flat;
  }
}
