import {
  createComment,
  createIdea,
  voteOnIdea
} from '../lib/store.mjs';
import {
  requireApiKey,
  streamVerdicts,
  summarizeIdeaTitle,
  validateIdeaInput,
  validateStartupIdea
} from '../lib/judge.mjs';
import { writeRelatedComment } from './comment.mjs';
import { blessProbabilityForBucket, evaluateIdeaTraffic, randomTrafficBucket } from './evaluation.mjs';
import { seedCommentAuthors, seedIdeas, seedVoterPoolSize } from './seed-data.mjs';
import {
  countIdeasCreatedSince,
  getBoardDistribution,
  getIdeaEvaluation,
  listExistingIdeaTexts,
  listBalancedVoteIdeas,
  listRandomIdeas,
  recordActivityRun,
  upsertIdeaEvaluation
} from './store.mjs';

const runsPerDayAtThirtyMinutes = 48;
const defaultDailyIdeas = 2.5;

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

const ideaPostProbability = numberFromEnv(
  'SEED_IDEA_PROBABILITY',
  defaultDailyIdeas / runsPerDayAtThirtyMinutes
);
const maxSeedIdeasPerDay = numberFromEnv('SEED_MAX_IDEAS_PER_DAY', 4);

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomVoteType(bucket, targetBoard) {
  if (bucket === 'controversial' && targetBoard === 'blessed') {
    return Math.random() < 0.65 ? 'bless' : 'damn';
  }

  if (bucket === 'controversial' && targetBoard === 'damned') {
    return Math.random() < 0.35 ? 'bless' : 'damn';
  }

  return Math.random() < blessProbabilityForBucket(bucket) ? 'bless' : 'damn';
}

function randomVoteCount() {
  return Math.round((Math.random() + Math.random()) * 5);
}

function randomCommentCount() {
  const roll = Math.random();
  if (roll < 0.25) return 0;
  if (roll < 0.75) return 1;
  return 2;
}

function randomCommentStance() {
  const roll = Math.random();
  if (roll < 0.2) return 'angel';
  if (roll < 0.42) return 'devil';
  return 'regular';
}

function randomSeedVisitorId() {
  return `seed-visitor-${Math.floor(Math.random() * seedVoterPoolSize)
    .toString()
    .padStart(3, '0')}`;
}

function chooseVoteTarget(distribution) {
  const total = distribution.blessed + distribution.purgatory + distribution.damned;
  if (total === 0) return 'purgatory';

  const shares = {
    blessed: distribution.blessed / total,
    purgatory: distribution.purgatory / total,
    damned: distribution.damned / total
  };
  const targetFloor = 0.28;

  if (shares.damned < targetFloor) return 'damned';
  if (shares.blessed < targetFloor) return 'blessed';
  if (shares.purgatory < targetFloor) return 'purgatory';

  const options = ['blessed', 'purgatory', 'damned'];
  return randomItem(options);
}

function utcDayStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function pickSeedIdea() {
  const existingIdeas = await listExistingIdeaTexts();
  const availableIdeas = seedIdeas.filter((idea) => !existingIdeas.has(idea));

  if (!availableIdeas.length) return null;
  return randomItem(availableIdeas);
}

async function createSeededIdea(actions) {
  const ideaText = await pickSeedIdea();
  if (!ideaText) {
    actions.push({ type: 'skip_idea', reason: 'seed_bank_exhausted' });
    return null;
  }

  const input = validateIdeaInput(ideaText);
  if (input.error) {
    actions.push({ type: 'skip_idea', reason: input.error, ideaText });
    return null;
  }

  const verdict = await validateStartupIdea(input.idea);
  if (!verdict.allowed) {
    actions.push({ type: 'skip_idea', reason: verdict.reason, ideaText });
    return null;
  }

  const streamText = { angel: '', devil: '' };
  await streamVerdicts(input.idea, (side, text) => {
    streamText[side] += text;
  });

  const title = await summarizeIdeaTitle(input.idea);
  const idea = await createIdea({
    title,
    ideaText: input.idea,
    angelMarkdown: streamText.angel,
    devilMarkdown: streamText.devil,
    authorDisplayName: 'Anonymous founder'
  });

  const evaluation = await ensureIdeaEvaluation(idea);
  actions.push({
    type: 'create_idea',
    id: idea.id,
    slug: idea.slug,
    title: idea.title,
    bucket: evaluation.bucket,
    fallback: evaluation.fallback
  });
  return idea;
}

async function ensureIdeaEvaluation(idea) {
  const existing = await getIdeaEvaluation(idea.id);
  if (existing) return existing;

  try {
    const evaluation = await evaluateIdeaTraffic(idea.ideaText);
    return upsertIdeaEvaluation({
      ideaId: idea.id,
      slug: idea.slug,
      bucket: evaluation.bucket,
      reason: evaluation.reason,
      fallback: false
    });
  } catch (error) {
    const bucket = randomTrafficBucket();
    return upsertIdeaEvaluation({
      ideaId: idea.id,
      slug: idea.slug,
      bucket,
      reason: `Fallback bucket: ${error.message || 'traffic evaluation failed'}`,
      fallback: true
    });
  }
}

async function voteOnRandomIdeas(actions, voteCount) {
  if (voteCount === 0) {
    actions.push({ type: 'skip_votes', reason: 'random_count_zero' });
    return;
  }

  const distribution = await getBoardDistribution();
  const targetBoard = chooseVoteTarget(distribution);
  const ideas = await listBalancedVoteIdeas({ limit: voteCount, target: targetBoard });

  actions.push({ type: 'vote_target', target: targetBoard, distribution });

  for (const idea of ideas) {
    const evaluation = await ensureIdeaEvaluation(idea);
    const voteType = randomVoteType(evaluation.bucket, targetBoard);
    const voter = randomSeedVisitorId();
    const updatedIdea = await voteOnIdea({
      idOrSlug: idea.slug,
      visitorId: voter,
      voteType
    });

    actions.push({
      type: 'vote',
      slug: idea.slug,
      target: targetBoard,
      boardBucket: idea.boardBucket,
      bucket: evaluation.bucket,
      fallback: evaluation.fallback,
      voteType,
      voter,
      bless: updatedIdea?.votes?.bless ?? 0,
      damn: updatedIdea?.votes?.damn ?? 0
    });
  }

  if (!ideas.length) {
    actions.push({ type: 'skip_votes', reason: 'no_published_ideas' });
  }
}

async function commentOnRandomIdeas(actions, commentCount) {
  if (commentCount === 0) {
    actions.push({ type: 'skip_comments', reason: 'random_count_zero' });
    return;
  }

  const ideas = await listRandomIdeas({ limit: commentCount });

  for (const idea of ideas) {
    const body = await writeRelatedComment(idea.ideaText);
    if (!body) {
      actions.push({ type: 'skip_comment', slug: idea.slug, reason: 'empty_comment' });
      continue;
    }

    const comment = await createComment({
      idOrSlug: idea.slug,
      authorDisplayName: randomItem(seedCommentAuthors),
      body,
      stance: randomCommentStance()
    });

    actions.push({
      type: 'comment',
      slug: idea.slug,
      commentId: comment?.id,
      body
    });
  }

  if (!ideas.length) {
    actions.push({ type: 'skip_comments', reason: 'no_published_ideas' });
  }
}

export async function runSeedBoard({ forceIdea = false } = {}) {
  const actions = [];

  if (process.env.SEED_BOARD_ENABLED === 'false') {
    actions.push({ type: 'skip_run', reason: 'SEED_BOARD_ENABLED=false' });
    await recordActivityRun({ status: 'skipped', actions });
    return { ok: true, status: 'skipped', actions };
  }

  try {
    requireApiKey();

    const seededToday = await countIdeasCreatedSince({
      source: 'cron',
      since: utcDayStart()
    });
    const shouldCreateIdea =
      forceIdea || (seededToday < maxSeedIdeasPerDay && Math.random() < ideaPostProbability);

    if (shouldCreateIdea) {
      await createSeededIdea(actions);
    } else {
      actions.push({
        type: 'skip_idea',
        reason: seededToday >= maxSeedIdeasPerDay ? 'daily_cap_reached' : 'probability_roll'
      });
    }

    await voteOnRandomIdeas(actions, randomVoteCount());
    await commentOnRandomIdeas(actions, randomCommentCount());

    await recordActivityRun({ status: 'ok', actions });
    return { ok: true, status: 'ok', actions };
  } catch (error) {
    actions.push({ type: 'error', message: error.message || 'Seed board run failed.' });
    await recordActivityRun({
      status: 'error',
      actions,
      errorMessage: error.message || 'Seed board run failed.'
    });
    throw error;
  }
}
