import { HARDCODED_BOOKING_REQUEST } from '../config/hardcoded';
import { orchestrate } from './orchestrator';

async function main() {
  const request = HARDCODED_BOOKING_REQUEST;

  try {
    const results = await orchestrate(request);

    if (results.length === 0) {
      console.error('\nNo results returned. Check screenshots/ directory for debugging.');
      process.exit(1);
    }

    // Print ranked results
    console.log('\n' + '='.repeat(60));
    console.log(`RANKED RESULTS (by: ${request.constraints.priority})`);
    console.log('='.repeat(60));
    results.forEach((r, i) => {
      console.log(
        `${i + 1}. [${r.appName}] ${r.name} — ${r.price} (ETA: ${r.etaMinutes} min, category: ${r.category})`
      );
    });
    console.log('='.repeat(60));

    // Also print raw JSON for debugging
    console.log('\nRaw JSON:');
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('Fatal error during orchestration:', err);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unhandled fatal error:', err);
  process.exit(1);
});
