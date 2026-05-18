import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  createToolset,
  listRegisteredTools,
  publicBundle,
  autonomousBundle,
  readOnlyBundle,
  tradingBundle,
} from '../../src/index.js';
import type { AuthPolicy } from '@metaplex-foundation/agent-runtime';

test('createToolset() with no options returns every registered tool', () => {
  const all = createToolset();
  const registered = listRegisteredTools();
  assert.equal(Object.keys(all).length, registered.length);
});

test('createToolset includes a single named tool when requested', () => {
  const ts = createToolset({ include: ['get-balance'] });
  assert.deepEqual(Object.keys(ts), ['getBalance']);
});

test('createToolset resolves "category:read" to every read tool', () => {
  const ts = createToolset({ include: ['category:read'] });
  const expected = listRegisteredTools()
    .filter((t) => t.category === 'read')
    .map((t) => toCamel(t.id))
    .sort();
  assert.deepEqual(Object.keys(ts).sort(), expected);
});

test('createToolset "*" expands to every tool, exclude subtracts', () => {
  const ts = createToolset({ include: ['*'], exclude: ['withdraw-sol'] });
  assert.ok(!('withdrawSol' in ts));
  assert.equal(Object.keys(ts).length, listRegisteredTools().length - 1);
});

test('createToolset throws for unknown tool id with list in message', () => {
  assert.throws(
    () => createToolset({ include: ['nope'] }),
    /unknown tool id "nope".*Known ids:/,
  );
});

test('createToolset throws for unknown category with list in message', () => {
  assert.throws(
    () => createToolset({ include: ['category:weather'] }),
    /unknown category "weather".*Known categories:/,
  );
});

test('createToolset throws when included tool requires a missing capability', () => {
  // swap-token requires jupiter; omit it
  assert.throws(
    () =>
      createToolset({
        include: ['swap-token'],
        capabilities: ['umi-rpc', 'agent-keypair'],
      }),
    /swap-token: missing jupiter/,
  );
});

test('createToolset succeeds when capabilities match the tools required', () => {
  const ts = createToolset({
    include: ['get-balance'],
    capabilities: ['umi-rpc'],
  });
  assert.deepEqual(Object.keys(ts), ['getBalance']);
});

test('custom authPolicy is invoked when the wrapped tool is called', async () => {
  let calls: { level: string; connected: string | null }[] = [];
  const policy: AuthPolicy = (level, ctx) => {
    calls.push({ level, connected: ctx.connectedWallet });
    return true; // allow everything for this test
  };
  const ts = createToolset({ include: ['sleep'], authPolicy: policy });
  const sleep = ts.sleep as any;
  // Mastra Tool.execute returns the wrapped function result; the wrapper
  // also reads from requestContext. Pass a minimal Map-like object.
  const fakeCtx = {
    requestContext: { get: (_k: string) => null },
  };
  await sleep.execute({ context: { seconds: 1 }, ...fakeCtx });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.level, 'public');
});

test('publicBundle exposes the historical surface and excludes autonomous-only', () => {
  assert.ok('getBalance' in publicBundle);
  assert.ok('transferSol' in publicBundle);
  assert.ok(!('setGoal' in publicBundle));
  assert.ok(!('withdrawSol' in publicBundle));
});

test('autonomousBundle excludes user-facing transfers, includes goals + withdraw', () => {
  assert.ok('setGoal' in autonomousBundle);
  assert.ok('withdrawSol' in autonomousBundle);
  assert.ok(!('transferSol' in autonomousBundle));
  assert.ok(!('transferToken' in autonomousBundle));
});

test('readOnlyBundle contains only read-category tools', () => {
  const keys = Object.keys(readOnlyBundle);
  assert.ok(keys.length > 0);
  for (const tool of listRegisteredTools()) {
    if (tool.category === 'read') {
      assert.ok(toCamel(tool.id) in readOnlyBundle, `${tool.id} should be in readOnlyBundle`);
    }
  }
  // No trading / treasury tools leaked in
  assert.ok(!('swapToken' in readOnlyBundle));
  assert.ok(!('withdrawSol' in readOnlyBundle));
});

test('tradingBundle contains exactly the trade-category tools', () => {
  assert.deepEqual(
    Object.keys(tradingBundle).sort(),
    ['buybackToken', 'sellToken', 'swapToken'],
  );
});

function toCamel(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
