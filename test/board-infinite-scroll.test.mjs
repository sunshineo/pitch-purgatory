import assert from 'node:assert/strict';
import test from 'node:test';

import { boardPageSize, createBoardAutoLoadObserver, hasMoreBoardIdeas } from '../src/board-infinite-scroll.js';

test('detects full board pages as having more ideas', () => {
  assert.equal(boardPageSize, 50);
  assert.equal(hasMoreBoardIdeas(50), true);
  assert.equal(hasMoreBoardIdeas(49), false);
});

test('auto-load observer triggers when sentinel enters the viewport', () => {
  const sentinel = {};
  const observed = [];
  let callback;
  let loadCount = 0;

  const observer = createBoardAutoLoadObserver({
    sentinel,
    onLoad: () => {
      loadCount += 1;
    },
    observerFactory: function FakeObserver(receivedCallback) {
      callback = receivedCallback;
      return {
        observe(target) {
          observed.push(target);
        },
        disconnect() {}
      };
    }
  });

  assert.ok(observer);
  assert.deepEqual(observed, [sentinel]);

  callback([{ isIntersecting: false }]);
  assert.equal(loadCount, 0);

  callback([{ isIntersecting: true }]);
  assert.equal(loadCount, 1);
});
