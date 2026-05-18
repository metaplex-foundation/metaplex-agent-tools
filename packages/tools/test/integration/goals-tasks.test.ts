import { test, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  setGoal,
  closeGoalTool,
  addTaskTool,
  closeTaskTool,
} from '../../src/tools/goals-tasks.js';
import { fakeContext } from '../helpers/mock-context.js';
import { createInMemoryStateStore, type InMemoryState } from '../helpers/in-memory-state.js';
import type { StateStore } from '@metaplex-foundation/agent-runtime';

/**
 * Integration tests for the autonomous goals-tasks toolset.
 *
 * Each test installs a fresh in-memory `StateStore`; the tools call into it
 * via `ctx.state` — no file IO, no global state.
 */

let store: StateStore;
let state: InMemoryState;

beforeEach(() => {
  const fresh = createInMemoryStateStore();
  store = fresh.store;
  state = fresh.state;
});

function ctx() {
  return { requestContext: fakeContext({ agentMode: 'autonomous', state: store }) } as any;
}

// ---------------------------------------------------------------------------
// set-goal
// ---------------------------------------------------------------------------

test('set-goal persists an active goal and writes a goal_set journal entry', async () => {
  const result = (await setGoal.execute!(
    { description: 'rebalance the treasury' },
    ctx(),
  )) as any;

  assert.equal(result.status, 'success');
  assert.match(result.goalId, /^g_/);
  assert.equal(result.description, 'rebalance the treasury');
  assert.equal(state.goals.length, 1);
  assert.equal(state.goals[0]!.status, 'active');
  assert.equal(state.goals[0]!.description, 'rebalance the treasury');
  assert.ok(state.journal.some((j) => j.kind === 'goal_set' && /rebalance/.test(j.summary)));
});

test('set-goal rejects empty description via Zod', async () => {
  const result = (await setGoal.execute!({ description: '' } as any, ctx())) as any;
  assert.equal(result.error, true);
});

test('set-goal rejects oversize description (>500 chars) via Zod', async () => {
  const result = (await setGoal.execute!({ description: 'x'.repeat(501) } as any, ctx())) as any;
  assert.equal(result.error, true);
});

// ---------------------------------------------------------------------------
// add-task
// ---------------------------------------------------------------------------

test('add-task creates an orphan task (no goalId) and persists it', async () => {
  const result = (await addTaskTool.execute!({ description: 'warm RPC cache' }, ctx())) as any;

  assert.equal(result.status, 'success');
  assert.match(result.taskId, /^t_/);
  assert.equal(result.goalId, null);
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0]!.status, 'pending');
  assert.equal(state.tasks[0]!.goalId, null);
});

test('add-task links to an existing goal when goalId references a known goal', async () => {
  const goal = (await setGoal.execute!({ description: 'grow holders' }, ctx())) as any;

  const result = (await addTaskTool.execute!(
    { description: 'tweet about token', goalId: goal.goalId },
    ctx(),
  )) as any;

  assert.equal(result.status, 'success');
  assert.equal(result.goalId, goal.goalId);
  assert.ok(state.tasks.find((t) => t.goalId === goal.goalId));
});

test('add-task rejects with NOT_FOUND when goalId references a missing goal', async () => {
  const result = (await addTaskTool.execute!(
    { description: 'orphan link', goalId: 'g_doesnotexist' },
    ctx(),
  )) as any;

  assert.equal(result.status, 'error');
  assert.equal(result.code, 'NOT_FOUND');
  assert.match(result.message, /No goal found/);
});

test('add-task rejects empty description via Zod', async () => {
  const result = (await addTaskTool.execute!({ description: '' } as any, ctx())) as any;
  assert.equal(result.error, true);
});

// ---------------------------------------------------------------------------
// close-task
// ---------------------------------------------------------------------------

test('close-task marks a task done and records the result', async () => {
  const created = (await addTaskTool.execute!({ description: 'mint asset' }, ctx())) as any;

  const result = (await closeTaskTool.execute!(
    { taskId: created.taskId, status: 'done', result: 'sig: abc' },
    ctx(),
  )) as any;

  assert.equal(result.status, 'success');
  assert.equal(result.finalStatus, 'done');
  const t = state.tasks.find((x) => x.id === created.taskId);
  assert.equal(t?.status, 'done');
  assert.equal(t?.result, 'sig: abc');
});

test('close-task returns info (not error) when marking a task failed', async () => {
  const created = (await addTaskTool.execute!({ description: 'risky op' }, ctx())) as any;

  const result = (await closeTaskTool.execute!(
    { taskId: created.taskId, status: 'failed', result: 'rpc timeout' },
    ctx(),
  )) as any;

  assert.equal(result.status, 'info');
  assert.equal(result.finalStatus, 'failed');
});

test('close-task returns NOT_FOUND for unknown taskId', async () => {
  const result = (await closeTaskTool.execute!(
    { taskId: 't_missing', status: 'done', result: 'nope' },
    ctx(),
  )) as any;

  assert.equal(result.status, 'error');
  assert.equal(result.code, 'NOT_FOUND');
});

test('close-task rejects unknown status via Zod', async () => {
  const result = (await closeTaskTool.execute!(
    { taskId: 't_abc', status: 'maybe', result: 'meh' } as any,
    ctx(),
  )) as any;

  assert.equal(result.error, true);
});

// ---------------------------------------------------------------------------
// close-goal
// ---------------------------------------------------------------------------

test('close-goal marks a goal achieved and appends a journal entry when reason is given', async () => {
  const goal = (await setGoal.execute!({ description: 'be excellent' }, ctx())) as any;
  const beforeJournalLen = state.journal.length;

  const result = (await closeGoalTool.execute!(
    { goalId: goal.goalId, status: 'achieved', reason: 'shipped feature' },
    ctx(),
  )) as any;

  assert.equal(result.status, 'success');
  assert.equal(result.finalStatus, 'achieved');
  const g = state.goals.find((x) => x.id === goal.goalId);
  assert.equal(g?.status, 'achieved');
  assert.equal(state.journal.length, beforeJournalLen + 1);
});

test('close-goal accepts abandoned status and works without a reason', async () => {
  const goal = (await setGoal.execute!({ description: 'experimental work' }, ctx())) as any;
  const beforeJournalLen = state.journal.length;

  const result = (await closeGoalTool.execute!(
    { goalId: goal.goalId, status: 'abandoned' },
    ctx(),
  )) as any;

  assert.equal(result.status, 'success');
  assert.equal(result.finalStatus, 'abandoned');
  assert.equal(state.journal.length, beforeJournalLen);
});

test('close-goal returns NOT_FOUND for unknown goalId', async () => {
  const result = (await closeGoalTool.execute!(
    { goalId: 'g_missing', status: 'achieved' },
    ctx(),
  )) as any;

  assert.equal(result.status, 'error');
  assert.equal(result.code, 'NOT_FOUND');
});

test('close-goal rejects unknown status via Zod', async () => {
  const result = (await closeGoalTool.execute!(
    { goalId: 'g_abc', status: 'cancelled' } as any,
    ctx(),
  )) as any;

  assert.equal(result.error, true);
});
