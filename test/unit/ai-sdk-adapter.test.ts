import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { z } from 'zod';
import { defineToolDescriptor } from '../../src/index.js';
import { toAISdkTool, toAISdkTools } from '../../src/adapters/ai-sdk.js';
import type { AgentContext } from '../../src/index.js';

/**
 * Build a stub `AgentContext`. Only fields actively touched by the test
 * tool's `execute` are filled in; the rest get safe defaults so the
 * descriptor body can read them without exploding.
 */
function stubAgentContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    umi: null as any,
    network: 'solana-devnet',
    agentMode: 'public',
    agentKeypairAddress: 'stub-keypair',
    walletAddress: null,
    ownerWallet: null,
    agentAssetAddress: null,
    agentTokenMint: null,
    tokenOverride: null,
    transactionSender: null,
    txCounter: null,
    dryRun: false,
    maxSlippageBps: 500,
    maxPriceImpactPct: 2,
    agentFeeSol: 0.001,
    jupiterApiKey: null,
    state: null,
    onAssetRegistered: null,
    onTokenLaunched: null,
    ensureFunded: null,
    ...overrides,
  };
}

test('toAISdkTool wraps a descriptor and forwards the closed-over AgentContext', async () => {
  let observed: AgentContext | null = null;
  const descriptor = defineToolDescriptor({
    id: 'echo-network',
    description: 'Echoes the network from the AgentContext.',
    inputSchema: z.object({ tag: z.string() }),
    authLevel: 'public',
    requires: [],
    category: 'utility',
    execute: async (input: { tag: string }, ctx) => {
      observed = ctx;
      return { tag: input.tag, network: ctx.network };
    },
  });

  const ctx = stubAgentContext({ network: 'solana-mainnet' });
  const wrapped = toAISdkTool(descriptor, ctx);
  // The AI SDK's Tool surfaces `execute` directly — invoke it like the SDK
  // would after parsing input from the model. Pass an empty options object
  // (toolCallId/messages/etc. are not load-bearing for this test).
  const result = await (wrapped.execute as any)({ tag: 'hi' }, {});
  assert.deepEqual(result, { tag: 'hi', network: 'solana-mainnet' });
  assert.equal(observed, ctx, 'descriptor.execute received the stub ctx by reference');
});

test('toAISdkTools camelCases ids and produces a record keyed by them', async () => {
  const d1 = defineToolDescriptor({
    id: 'get-thing',
    description: 'd1',
    inputSchema: z.object({}),
    authLevel: 'public',
    requires: [],
    category: 'utility',
    execute: async () => ({ ok: true }),
  });
  const d2 = defineToolDescriptor({
    id: 'do-other-thing',
    description: 'd2',
    inputSchema: z.object({}),
    authLevel: 'public',
    requires: [],
    category: 'utility',
    execute: async () => ({ ok: true }),
  });

  const tools = toAISdkTools([d1, d2], stubAgentContext());
  assert.deepEqual(Object.keys(tools).sort(), ['doOtherThing', 'getThing']);
});
