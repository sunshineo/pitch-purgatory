import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { evaluateIdeaTraffic, randomTrafficBucket } from './evaluation.mjs';
import { closeCronStore, listIdeasMissingEvaluations, upsertIdeaEvaluation } from './store.mjs';

const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 500;

function printHelp() {
  console.log(`Usage: node cron/backfill-evaluations.mjs [--limit=500]

Evaluates published ideas that do not yet have cron_idea_evaluations rows.
If the LLM evaluator fails for an idea, stores a random fallback bucket.`);
}

async function evaluationForIdea(idea) {
  try {
    const evaluation = await evaluateIdeaTraffic(idea.ideaText);
    return { ...evaluation, fallback: false };
  } catch (error) {
    return {
      bucket: randomTrafficBucket(),
      reason: `Fallback bucket: ${error.message || 'traffic evaluation failed'}`,
      fallback: true
    };
  }
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }

  const ideas = await listIdeasMissingEvaluations({ limit });
  const results = [];

  for (const idea of ideas) {
    const evaluation = await evaluationForIdea(idea);
    await upsertIdeaEvaluation({
      ideaId: idea.id,
      slug: idea.slug,
      bucket: evaluation.bucket,
      reason: evaluation.reason,
      fallback: evaluation.fallback
    });

    const result = {
      slug: idea.slug,
      bucket: evaluation.bucket,
      fallback: evaluation.fallback
    };
    results.push(result);
    console.log(JSON.stringify(result));
  }

  console.log(
    JSON.stringify({
      ok: true,
      evaluated: results.length,
      remainingLimit: limit
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
