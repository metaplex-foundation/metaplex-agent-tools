import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  publicBundle,
  autonomousBundle,
  listRegisteredTools,
} from '../../src/index.js';

const EXPECTED_PUBLIC = [
  'buybackToken',
  'delegateExecution',
  'fundAgentSol',
  'getBalance',
  'getTokenBalances',
  'getTokenMetadata',
  'getTokenPrice',
  'getTransaction',
  'launchToken',
  'registerAgent',
  'sellToken',
  'sleep',
  'swapToken',
  'transferSol',
  'transferToken',
];

const EXPECTED_AUTONOMOUS = [
  'addTask',
  'buybackToken',
  'closeGoal',
  'closeTask',
  'delegateExecution',
  'fundAgentSol',
  'getBalance',
  'getTokenBalances',
  'getTokenMetadata',
  'getTokenPrice',
  'getTransaction',
  'launchToken',
  'registerAgent',
  'sellToken',
  'setGoal',
  'setPaused',
  'sleep',
  'swapToken',
  'withdrawSol',
];

test('publicBundle exposes the expected stable surface', () => {
  assert.deepEqual(Object.keys(publicBundle).sort(), EXPECTED_PUBLIC);
});

test('autonomousBundle exposes the expected stable surface', () => {
  assert.deepEqual(Object.keys(autonomousBundle).sort(), EXPECTED_AUTONOMOUS);
});

test('publicBundle does not leak autonomous-only tools', () => {
  const autonomousOnly = ['setGoal', 'closeGoal', 'addTask', 'closeTask', 'setPaused', 'withdrawSol'];
  for (const banned of autonomousOnly) {
    assert.equal(
      banned in publicBundle,
      false,
      `${banned} must not be in publicBundle (autonomous-only)`,
    );
  }
});

test('autonomousBundle does not leak public-only transfer tools', () => {
  const publicOnly = ['transferSol', 'transferToken'];
  for (const banned of publicOnly) {
    assert.equal(
      banned in autonomousBundle,
      false,
      `${banned} must not be in autonomousBundle (public-only)`,
    );
  }
});

test('every registered tool has an execute function after withAuth wrapping', () => {
  for (const [name, tool] of Object.entries(publicBundle)) {
    assert.equal(typeof (tool as { execute?: unknown }).execute, 'function', `publicBundle.${name}.execute must be a function`);
  }
  for (const [name, tool] of Object.entries(autonomousBundle)) {
    assert.equal(typeof (tool as { execute?: unknown }).execute, 'function', `autonomousBundle.${name}.execute must be a function`);
  }
});

test('every registered tool has authLevel + category + requires metadata', () => {
  const defs = listRegisteredTools();
  assert.ok(defs.length > 0, 'registry must contain at least one tool');
  for (const def of defs) {
    assert.ok(typeof def.id === 'string' && def.id.length > 0, `${def.id} has id`);
    assert.ok(typeof def.authLevel === 'string', `${def.id} has authLevel`);
    assert.ok(typeof def.category === 'string', `${def.id} has category`);
    assert.ok(Array.isArray(def.requires), `${def.id}.requires is an array`);
    assert.ok(typeof (def as { execute?: unknown }).execute === 'function', `${def.id}.execute is a function`);
  }
});
