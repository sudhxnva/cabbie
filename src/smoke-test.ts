/**
 * Issue #1 Smoke Test: Verify adb-mcp works with emulator serial targeting
 *
 * Run: npx tsx src/smoke-test.ts
 *
 * Passes if Claude can describe the screen of emulator-5554 without errors.
 */
import { query } from '@anthropic-ai/claude-agent-sdk';

const SERIAL = 'emulator-5554';

async function main() {
  console.log(`\nSmoke test: ADB MCP serial targeting (${SERIAL})\n`);

  for await (const message of query({
    prompt: `You have access to an ADB MCP server. Take a screenshot of the Android emulator with serial ${SERIAL} and describe what you see on screen in 1-2 sentences. Use -s ${SERIAL} for all ADB commands.`,
    options: {
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      mcpServers: {
        adb: {
          command: 'npx',
          args: ['-y', 'adb-mcp'],
        },
      },
      allowedTools: ['mcp__adb__*'],
      maxTurns: 5,
    },
  })) {
    if ('result' in message) {
      console.log('\n--- Result ---');
      console.log(message.result);
      console.log('\nSmoke test complete. If the description matches emulator-5554 content, issue #1 is verified.');
    }
  }
}

main().catch(err => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
