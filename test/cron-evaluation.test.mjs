import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blessProbabilityForBucket,
  calculateEvaluationNeeds,
  pickRankedEvaluationAssignments
} from '../cron/evaluation.mjs';

test('evaluation needs target one third blessed and one third damned', () => {
  assert.deepEqual(
    calculateEvaluationNeeds({
      blessed: 0,
      damned: 0,
      neutral: 27
    }),
    {
      total: 27,
      targetBlessed: 9,
      targetDamned: 9,
      targetNeutral: 9,
      blessedNeeded: 9,
      damnedNeeded: 9
    }
  );

  assert.deepEqual(
    calculateEvaluationNeeds({
      blessed: 22,
      damned: 18,
      neutral: 50
    }),
    {
      total: 90,
      targetBlessed: 30,
      targetDamned: 30,
      targetNeutral: 30,
      blessedNeeded: 8,
      damnedNeeded: 12
    }
  );
});

test('missing or old evaluation buckets vote like neutral purgatory ideas', () => {
  assert.equal(blessProbabilityForBucket(null), 0.5);
  assert.equal(blessProbabilityForBucket(undefined), 0.5);
  assert.equal(blessProbabilityForBucket('controversial'), 0.5);
});

test('ranked assignments pick the top for blessed and bottom for damned', () => {
  const ideas = [
    { id: 'a', slug: 'idea-a' },
    { id: 'b', slug: 'idea-b' },
    { id: 'c', slug: 'idea-c' },
    { id: 'd', slug: 'idea-d' },
    { id: 'e', slug: 'idea-e' }
  ];
  const rankedIds = ['c', 'a', 'b', 'e', 'd'];

  assert.deepEqual(
    pickRankedEvaluationAssignments({
      ideas,
      rankedIds,
      needs: {
        blessedNeeded: 1,
        damnedNeeded: 2
      }
    }),
    [
      {
        idea: ideas[2],
        bucket: 'blessed',
        rank: 1,
        rankedTotal: 5
      },
      {
        idea: ideas[3],
        bucket: 'damned',
        rank: 5,
        rankedTotal: 5
      },
      {
        idea: ideas[4],
        bucket: 'damned',
        rank: 4,
        rankedTotal: 5
      }
    ]
  );
});

test('ranked assignments accept slugs returned by the ranker', () => {
  const ideas = [
    { id: 'a', slug: 'idea-a' },
    { id: 'b', slug: 'idea-b' },
    { id: 'c', slug: 'idea-c' }
  ];

  assert.deepEqual(
    pickRankedEvaluationAssignments({
      ideas,
      rankedIds: ['idea-c', 'idea-b', 'idea-a'],
      needs: {
        blessedNeeded: 1,
        damnedNeeded: 1
      }
    }),
    [
      {
        idea: ideas[2],
        bucket: 'blessed',
        rank: 1,
        rankedTotal: 3
      },
      {
        idea: ideas[0],
        bucket: 'damned',
        rank: 3,
        rankedTotal: 3
      }
    ]
  );
});
