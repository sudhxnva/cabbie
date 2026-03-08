import { randomUUID } from "crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { AppConfig, BookingConfirmation, BookingRequest, PriceResult, RankedResult, RideOption } from "./types";

import { ts } from "./log";

const ROOT = resolve(__dirname, "..");

const PriceResultSchema = {
  type: "object",
  properties: {
    appName: { type: "string" },
    success: { type: "boolean" },
    error: { type: "string" },
    options: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          price: { type: "string" },
          priceMin: { type: "number" },
          etaMinutes: { type: "number" },
          category: {
            type: "string",
            enum: ["standard", "comfort", "xl", "luxury", "eco", "free"],
          },
        },
        required: ["name", "price", "etaMinutes", "category"],
      },
    },
  },
  required: ["appName", "success", "options"],
};

function loadTemplate(name: string): string {
  return readFileSync(resolve(ROOT, "prompts", name), "utf8");
}

function loadMemory(filePath: string): string {
  const full = resolve(ROOT, filePath);
  if (!existsSync(full)) return "(no memory yet)";
  const content = readFileSync(full, "utf8").trim();
  return content || "(no memory yet)";
}

function escapeForAdb(text: string): string {
  return text.replace(/ /g, "%s").replace(/'/g, "\\'");
}

export function buildSubAgentPrompt(
  app: AppConfig,
  request: BookingRequest,
  deepLinkUri?: string | null,
): string {
  const template = loadTemplate("sub-agent.md");
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
    .replace(/{{MEMORY_CONTENT}}/g, memory)
    .replace(/{{DEEPLINK_URI}}/g, deepLinkUri ?? 'N/A');
}

export async function runSubAgent(
  app: AppConfig,
  request: BookingRequest,
  deepLinkUri?: string | null,
): Promise<PriceResult> {
  const prompt = buildSubAgentPrompt(app, request, deepLinkUri);
  console.log(
    `${ts()}  [${app.appName}] Starting sub-agent (device: ${app.emulatorSerial})...`,
  );

  const stream = query({
    prompt,
    options: {
      model: "claude-haiku-4-5-20251001",
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      mcpServers: {
        adb: {
          command: "/opt/homebrew/bin/uv",
          args: [
            "--directory",
            "/Users/sudhanva/Documents/Personal/Code/android-mcp-server",
            "run",
            "server.py",
          ],
          env: { ANDROID_DEVICE_SERIAL: app.emulatorSerial },
        },
      },
      allowedTools: [
        "mcp__adb__tap_by_text",
        "mcp__adb__tap_and_type",
        "mcp__adb__tap_suggestion",
        "mcp__adb__get_all_ui_text",
        "mcp__adb__get_screenshot",
        "mcp__adb__get_screenshot_text",
        "mcp__adb__execute_adb_shell_command",
        "Read",
        "Write",
      ],
      outputFormat: {
        type: "json_schema",
        schema: PriceResultSchema,
      },
      maxTurns: 30,
      cwd: ROOT,
    },
  });

  // Track the last tool name so tool_result logs can be labelled and sized appropriately
  const lastToolName: { value: string } = { value: "" };

  for await (const msg of stream) {
    if (msg.type === "system" && msg.subtype === "init") {
      console.log(
        `${ts()}  [${app.appName}] Session init — model: ${msg.model}, tools: ${msg.tools.join(", ")}`,
      );
      console.log(
        `${ts()}  [${app.appName}] MCP servers: ${msg.mcp_servers.map(s => `${s.name}(${s.status})`).join(", ")}`,
      );
    } else if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text.trim()) {
          console.log(`${ts()}  [${app.appName}] 🤖 ${block.text.trim()}`);
        } else if (block.type === "tool_use") {
          lastToolName.value = block.name;
          console.log(
            `${ts()}  [${app.appName}] 🔧 ${block.name}(${JSON.stringify(block.input).slice(0, 120)})`,
          );
        }
      }
    } else if (msg.type === "user") {
      for (const block of msg.message.content) {
        if (
          typeof block === "object" &&
          "type" in block &&
          block.type === "tool_result"
        ) {
          const content = Array.isArray(block.content)
            ? block.content
                .map((c: any) => (c.type === "text" ? c.text : "[image]"))
                .join("")
            : String(block.content ?? "");
          if (content.trim()) {
            // Show full output for get_all_ui_text so we can verify prices are present;
            // truncate everything else to keep logs readable.
            const limit = lastToolName.value === "mcp__adb__get_all_ui_text" ? Infinity : 200;
            const preview = isFinite(limit) ? content.slice(0, limit) : content;
            const label = lastToolName.value ? ` (${lastToolName.value})` : "";
            console.log(
              `${ts()}  [${app.appName}] ✅ tool_result${label}: ${preview}`,
            );
          }
        }
      }
    } else if (msg.type === "result") {
      if (msg.subtype === "success") {
        console.log(
          `${ts()}  [${app.appName}] Sub-agent complete (${msg.num_turns} turns, $${msg.total_cost_usd.toFixed(4)})`,
        );
        let result: PriceResult;
        if (msg.structured_output) {
          result = msg.structured_output as PriceResult;
        } else {
          try {
            result = JSON.parse(msg.result) as PriceResult;
          } catch {
            return {
              appName: app.appName,
              success: false,
              error: "Could not parse result",
              options: [],
            };
          }
        }
        // Assign optionId to each option — agents don't generate these
        result.options = result.options.map(o => ({ ...o, optionId: randomUUID() }));
        return result;
      } else {
        const errors = msg.errors.join("; ");
        console.error(
          `${ts()}  [${app.appName}] Sub-agent failed (${msg.subtype}): ${errors}`,
        );
        return {
          appName: app.appName,
          success: false,
          error: `${msg.subtype}: ${errors}`,
          options: [],
        };
      }
    }
  }

  return {
    appName: app.appName,
    success: false,
    error: "No result message received",
    options: [],
  };
}

const BookingConfirmationSchema = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    appName: { type: "string" },
    driverName: { type: "string" },
    etaMinutes: { type: "number" },
    tripId: { type: "string" },
    error: { type: "string" },
  },
  required: ["success", "appName"],
};

export function buildBookingAgentPrompt(
  app: AppConfig,
  option: RideOption,
  request: BookingRequest,
): string {
  const template = loadTemplate("booking-agent.md");
  const memory = loadMemory(app.memoryFilePath);

  return template
    .replace(/{{APP_NAME}}/g, app.appName)
    .replace(/{{APP_ID}}/g, app.appId)
    .replace(/{{EMULATOR_SERIAL}}/g, app.emulatorSerial)
    .replace(/{{OPTION_NAME}}/g, option.name)
    .replace(/{{OPTION_PRICE}}/g, option.price)
    .replace(/{{OPTION_CATEGORY}}/g, option.category)
    .replace(/{{PICKUP}}/g, request.pickup.address)
    .replace(/{{DROPOFF}}/g, request.dropoff.address)
    .replace(/{{MEMORY_CONTENT}}/g, memory);
}

export async function invokeBookingAgent(
  app: AppConfig,
  option: RideOption,
  request: BookingRequest,
): Promise<BookingConfirmation> {
  const prompt = buildBookingAgentPrompt(app, option, request);
  console.log(`${ts()}  [${app.appName}] Starting booking agent for option: ${option.name} (${option.price})...`);

  const stream = query({
    prompt,
    options: {
      model: "claude-haiku-4-5-20251001",
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      mcpServers: {
        adb: {
          command: "/opt/homebrew/bin/uv",
          args: [
            "--directory",
            "/Users/sudhanva/Documents/Personal/Code/android-mcp-server",
            "run",
            "server.py",
          ],
          env: { ANDROID_DEVICE_SERIAL: app.emulatorSerial },
        },
      },
      allowedTools: [
        "mcp__adb__tap_by_text",
        "mcp__adb__tap_and_type",
        "mcp__adb__tap_suggestion",
        "mcp__adb__get_all_ui_text",
        "mcp__adb__get_screenshot",
        "mcp__adb__get_screenshot_text",
        "mcp__adb__execute_adb_shell_command",
        "Read",
        "Write",
      ],
      outputFormat: {
        type: "json_schema",
        schema: BookingConfirmationSchema,
      },
      maxTurns: 20,
      cwd: ROOT,
    },
  });

  for await (const msg of stream) {
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text.trim()) {
          console.log(`${ts()}  [${app.appName}] 🤖 ${block.text.trim()}`);
        } else if (block.type === "tool_use") {
          console.log(
            `${ts()}  [${app.appName}] 🔧 ${block.name}(${JSON.stringify(block.input).slice(0, 120)})`,
          );
        }
      }
    } else if (msg.type === "result") {
      if (msg.subtype === "success") {
        console.log(
          `${ts()}  [${app.appName}] Booking agent complete (${msg.num_turns} turns, $${msg.total_cost_usd.toFixed(4)})`,
        );
        if (msg.structured_output) {
          return msg.structured_output as BookingConfirmation;
        }
        try {
          return JSON.parse(msg.result) as BookingConfirmation;
        } catch {
          return { success: false, appName: app.appName, sessionId: "", optionId: "", error: "Could not parse result" };
        }
      } else {
        const errors = msg.errors.join("; ");
        console.error(`${ts()}  [${app.appName}] Booking agent failed: ${errors}`);
        return { success: false, appName: app.appName, sessionId: "", optionId: "", error: `${msg.subtype}: ${errors}` };
      }
    }
  }

  return { success: false, appName: app.appName, sessionId: "", optionId: "", error: "No result message received" };
}

export function rankResults(
  results: PriceResult[],
  priority: BookingRequest["constraints"]["priority"],
): RankedResult[] {
  const flat: RankedResult[] = results
    .filter(r => r.success)
    .flatMap(r => r.options.map(o => ({ ...o, appName: r.appName })));

  switch (priority) {
    case "cheapest":
      return flat.sort(
        (a, b) => (a.priceMin ?? Infinity) - (b.priceMin ?? Infinity),
      );
    case "fastest":
      return flat.sort((a, b) => a.etaMinutes - b.etaMinutes);
    case "comfortable": {
      const order = ["comfort", "standard", "xl", "luxury", "eco", "free"];
      return flat.sort(
        (a, b) => order.indexOf(a.category) - order.indexOf(b.category),
      );
    }
    case "luxury": {
      const order = ["luxury", "comfort", "xl", "standard", "eco", "free"];
      return flat.sort(
        (a, b) => order.indexOf(a.category) - order.indexOf(b.category),
      );
    }
    case "eco":
      return flat.filter(r => r.category === "eco");
    case "free":
      return flat.filter(r => r.category === "free");
    default:
      return flat;
  }
}
