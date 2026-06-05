import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  publicBundle as rootPublicBundle,
  autonomousBundle as rootAutonomousBundle,
  readOnlyBundle as rootReadOnlyBundle,
  tradingBundle as rootTradingBundle,
  type AgentContext,
} from '../../src/index.js';

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

test('mastra adapter bundles produce the same tool ids as the root bundles', async () => {
  const mastra = await import('../../src/adapters/mastra.js');
  // Force evaluation of the lazy proxies (so we can sort/compare).
  const cases: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ['publicBundle', mastra.publicBundle, rootPublicBundle],
    ['autonomousBundle', mastra.autonomousBundle, rootAutonomousBundle],
    ['readOnlyBundle', mastra.readOnlyBundle, rootReadOnlyBundle],
    ['tradingBundle', mastra.tradingBundle, rootTradingBundle],
  ];
  for (const [name, viaMastra, viaRoot] of cases) {
    assert.deepEqual(
      Object.keys(viaMastra).sort(),
      Object.keys(viaRoot).sort(),
      `${name} key set should match the root bundle`,
    );
  }
});

test('ai-sdk adapter bundles produce the same tool ids as the root bundles', async () => {
  const aiSdk = await import('../../src/adapters/ai-sdk.js');
  const ctx = stubAgentContext();
  const cases: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ['publicBundle', aiSdk.publicBundle(ctx), rootPublicBundle],
    ['autonomousBundle', aiSdk.autonomousBundle(ctx), rootAutonomousBundle],
    ['readOnlyBundle', aiSdk.readOnlyBundle(ctx), rootReadOnlyBundle],
    ['tradingBundle', aiSdk.tradingBundle(ctx), rootTradingBundle],
  ];
  for (const [name, viaAISdk, viaRoot] of cases) {
    assert.deepEqual(
      Object.keys(viaAISdk).sort(),
      Object.keys(viaRoot).sort(),
      `${name} key set should match the root bundle`,
    );
  }
});
