import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { setPausedTool } from '../../src/tools/set-paused.js';
import { fakeContext } from '../helpers/mock-context.js';
import { createInMemoryStateStore } from '../helpers/in-memory-state.js';

/**
 * Integration tests for `set-paused`. The tool reads its `StateStore` from
 * the agent context — no file IO, no globals. Each test installs a fresh
 * in-memory state store so cases are fully isolated.
 */

test('set-paused pauses the worker and writes a pause journal entry', async () => {
  const { store, state } = createInMemoryStateStore();
  const result = (await setPausedTool.execute!(
    { paused: true, reason: 'manual stop' },
    { requestContext: fakeContext({ agentMode: 'autonomous', state: store }) } as any,
  )) as any;

  assert.equal(result.status, 'success');
  assert.equal(result.paused, true);
  assert.match(result.message, /paused/);
  assert.equal(state.paused, true);
  assert.equal(state.journal.length, 1);
  assert.equal(state.journal[0]!.kind, 'pause');
  assert.equal(state.journal[0]!.summary, 'manual stop');
});

test('set-paused unpauses after a previous pause and writes an unpause entry', async () => {
  const { store, state } = createInMemoryStateStore();
  const ctx = { requestContext: fakeContext({ agentMode: 'autonomous', state: store }) } as any;

  await setPausedTool.execute!({ paused: true, reason: 'first pause' }, ctx);
  const result = (await setPausedTool.execute!(
    { paused: false, reason: 'back online' },
    ctx,
  )) as any;

  assert.equal(result.status, 'success');
  assert.equal(result.paused, false);
  assert.match(result.message, /resumed/);
  assert.equal(state.paused, false);
  assert.equal(state.journal.length, 2);
  assert.equal(state.journal[1]!.kind, 'unpause');
  assert.equal(state.journal[1]!.summary, 'back online');
});

test('set-paused is idempotent: pause-pause writes only one journal entry', async () => {
  const { store, state } = createInMemoryStateStore();
  const ctx = { requestContext: fakeContext({ agentMode: 'autonomous', state: store }) } as any;

  await setPausedTool.execute!({ paused: true, reason: 'one' }, ctx);
  await setPausedTool.execute!({ paused: true, reason: 'two' }, ctx);

  assert.equal(state.paused, true);
  assert.equal(state.journal.length, 1, 'second pause-while-paused must not append');
});

test('set-paused returns INVALID_INPUT if no state store is provided', async () => {
  const result = (await setPausedTool.execute!(
    { paused: true },
    { requestContext: fakeContext({ agentMode: 'autonomous', state: null }) } as any,
  )) as any;

  assert.equal(result.status, 'error');
  assert.equal(result.code, 'INVALID_INPUT');
});

test('set-paused rejects non-boolean paused via Zod', async () => {
  const { store } = createInMemoryStateStore();
  const result = (await setPausedTool.execute!(
    { paused: 'yes' } as any,
    { requestContext: fakeContext({ agentMode: 'autonomous', state: store }) } as any,
  )) as any;

  assert.equal(result.error, true);
});

test('set-paused rejects oversize reason via Zod (>300 chars)', async () => {
  const { store } = createInMemoryStateStore();
  const result = (await setPausedTool.execute!(
    { paused: true, reason: 'x'.repeat(301) } as any,
    { requestContext: fakeContext({ agentMode: 'autonomous', state: store }) } as any,
  )) as any;

  assert.equal(result.error, true);
});
