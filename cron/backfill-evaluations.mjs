import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { balanceIdeaEvaluations } from './seed-board.mjs';
import { closeCronStore } from './store.mjs';

function printHelp() {
  console.log(`Usage: node cron/backfill-evaluations.mjs

Balances missing cron_idea_evaluations rows.
Published ideas with no evaluation stay neutral/purgatory unless the batch ranker
needs more blessed or damned traffic intents to approach a one-third split.`);
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }

  const actions = [];
  const assignments = await balanceIdeaEvaluations(actions);

  for (const action of actions) {
    console.log(JSON.stringify(action));
  }

  console.log(
    JSON.stringify({
      ok: true,
      assigned: assignments.length
    })
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    await main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  } finally {
    await closeCronStore();
  }
}
