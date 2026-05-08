import 'dotenv/config';
import { runSeedBoard } from './seed-board.mjs';
import { closeCronStore } from './store.mjs';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Usage: npm run seed:once -- [--force-idea]

Runs one seeded board activity pass using OPENAI_API_KEY and DATABASE_URL from the environment.

Options:
  --force-idea  Publish a seeded idea even if the normal probability roll would skip it.
  --help        Show this help text.`);
  process.exit(0);
}

const forceIdea = process.argv.includes('--force-idea');

try {
  const result = await runSeedBoard({ forceIdea });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
} finally {
  await closeCronStore();
}
