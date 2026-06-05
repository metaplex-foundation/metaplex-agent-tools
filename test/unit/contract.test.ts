import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { z } from 'zod';
import {
  defineToolDescriptor,
  listRegisteredTools,
  type AgentContext,
} from '../../src/index.js';
import { toMastraTool } from '../../src/adapters/mastra.js';
import { toAISdkTool } from '../../src/adapters/ai-sdk.js';

const KEBAB_CASE_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function stubAgentContext(): AgentContext {
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
  };
}

test('every registered tool id is kebab-case', () => {
  const tools = listRegisteredTools();
  assert.ok(tools.length > 0, 'sanity: at least one tool is registered');
  for (const t of tools) {
    assert.match(t.id, KEBAB_CASE_RE, `${t.id} should be kebab-case`);
  }
});

test('every registered tool exposes a descriptor with matching id + metadata', () => {
  for (const def of listRegisteredTools()) {
    const d = def.descriptor;
    assert.equal(d.id, def.id);
    assert.equal(d.authLevel, def.authLevel);
    assert.equal(d.category, def.category);
    assert.deepEqual(d.requires ?? [], def.requires);
    assert.equal(typeof d.execute, 'function');
  }
});

test('round-trip: toMastraTool and toAISdkTool both forward to the same descriptor.execute', async () => {
  let mastraCalls = 0;
  let aiSdkCalls = 0;
  let lastInputMastra: unknown = null;
  let lastInputAISdk: unknown = null;
  let lastCtxMastra: AgentContext | null = null;
  let lastCtxAISdk: AgentContext | null = null;

  const descriptor = defineToolDescriptor({
    id: 'round-trip-probe',
    description: 'A probe descriptor used to assert adapter round-trip parity.',
    inputSchema: z.object({ n: z.number() }),
    authLevel: 'public',
    requires: [],
    category: 'utility',
    execute: async (input: { n: number }, ctx) => {
      return { received: input.n, network: ctx.network };
    },
  });

  // Spy by wrapping the descriptor once for each adapter. The descriptor
  // function reference is the same on both sides; we just observe the
  // calls by re-wrapping and asserting input/ctx parity.
  const spiedDescriptor = {
    ...descriptor,
    execute: async (input: { n: number }, ctx: AgentContext) => {
      return descriptor.execute(input, ctx);
    },
  };

  const mastraWrapped = toMastraTool({
    ...spiedDescriptor,
    execute: async (input: { n: number }, ctx: AgentContext) => {
      mastraCalls++;
      lastInputMastra = input;
      lastCtxMastra = ctx;
      return descriptor.execute(input, ctx);
    },
  });
  const ctx = stubAgentContext();
  const aiSdkWrapped = toAISdkTool(
    {
      ...spiedDescriptor,
      execute: async (input: { n: number }, ctx: AgentContext) => {
        aiSdkCalls++;
        lastInputAISdk = input;
        lastCtxAISdk = ctx;
        return descriptor.execute(input, ctx);
      },
    },
    ctx,
  );

  // Invoke via Mastra's Tool.execute(input, { requestContext }) shape.
  // Stub requestContext with the agentCtx fields readAgentContext pulls
  // out.
  const requestContext = {
    get: (key: string) => (ctx as unknown as Record<string, unknown>)[key],
  };
  const mastraResult = await (mastraWrapped.execute as any)(
    { n: 7 },
    { requestContext },
  );
  // AI SDK's Tool.execute(input, options).
  const aiSdkResult = await (aiSdkWrapped.execute as any)({ n: 7 }, {});

  assert.equal(mastraCalls, 1);
  assert.equal(aiSdkCalls, 1);
  assert.deepEqual(lastInputMastra, { n: 7 });
  assert.deepEqual(lastInputAISdk, { n: 7 });
  assert.equal(lastCtxMastra?.network, 'solana-devnet');
  assert.equal(lastCtxAISdk, ctx, 'ai-sdk passed the closed-over ctx by reference');
  assert.deepEqual(mastraResult, aiSdkResult);
});

test('schema parity: fixture input parses identically through both adapters', () => {
  const descriptor = defineToolDescriptor({
    id: 'schema-probe',
    description: 'Probe descriptor for schema parity.',
    inputSchema: z.object({
      address: z.string().min(1),
      amount: z.number().positive(),
    }),
    authLevel: 'public',
    requires: [],
    category: 'utility',
    execute: async (input: { address: string; amount: number }) => input,
  });

  const fixture = { address: 'AbC', amount: 1.5 };

  const mastraWrapped = toMastraTool(descriptor);
  const aiSdkWrapped = toAISdkTool(descriptor, stubAgentContext());

  // Both adapters expose the schema on the wrapped tool. Parse the
  // fixture through each and assert structural equality.
  const mastraParsed = (mastraWrapped.inputSchema as z.ZodType).parse(fixture);
  const aiSdkParsed = (aiSdkWrapped.inputSchema as z.ZodType).parse(fixture);
  assert.deepEqual(mastraParsed, aiSdkParsed);
  assert.deepEqual(mastraParsed, fixture);
});

test('schema parity: invalid input is rejected by both adapters', () => {
  const descriptor = defineToolDescriptor({
    id: 'schema-reject-probe',
    description: 'Probe descriptor for schema rejection.',
    inputSchema: z.object({
      seconds: z.number().int().min(1).max(300),
    }),
    authLevel: 'public',
    requires: [],
    category: 'utility',
    execute: async (input: { seconds: number }) => input,
  });

  const mastraWrapped = toMastraTool(descriptor);
  const aiSdkWrapped = toAISdkTool(descriptor, stubAgentContext());

  const bad = { seconds: 0 };
  assert.throws(() => (mastraWrapped.inputSchema as z.ZodType).parse(bad));
  assert.throws(() => (aiSdkWrapped.inputSchema as z.ZodType).parse(bad));
});
