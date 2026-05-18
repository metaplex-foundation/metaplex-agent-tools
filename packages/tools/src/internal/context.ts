import type { AgentContext } from './types/agent.js';

/**
 * Read the full `AgentContext` out of a Mastra `RequestContext` (or any
 * Map-like object exposing `.get(key)`).
 *
 * Missing fields default to `null` (for object/string types) or a safe
 * baseline (for primitives). A tool that actually requires a missing
 * field will fail with a clear error when it dereferences `null` —
 * which is much easier to debug than a silent `undefined`.
 *
 * The one exception is `agentMode`, which has no safe default — every
 * tool that consults the context needs to know if it's running in chat
 * or worker-loop context, and a missing value would just hide a host
 * wiring bug.
 */
export function readAgentContext(ctx: any): AgentContext {
  const opt = <T>(key: string, fallback: T): T => {
    try {
      const v = ctx?.get?.(key);
      return v === undefined || v === null ? fallback : (v as T);
    } catch {
      return fallback;
    }
  };

  const agentMode = ctx?.get?.('agentMode');
  if (agentMode !== 'public' && agentMode !== 'autonomous') {
    throw new Error(
      "AgentContext is missing 'agentMode' (must be 'public' or 'autonomous'). Host did not populate RequestContext correctly.",
    );
  }

  return {
    // umi/network/agentKeypairAddress are typed as required because every
    // production host provides them — they're left as raw .get() so a missing
    // value surfaces as a dereference error at the call site (clearer than
    // a generic "missing key" thrown here).
    umi: opt<any>('umi', null),
    network: opt<'solana-mainnet' | 'solana-devnet'>('network', 'solana-mainnet'),
    agentKeypairAddress: opt<string>('agentKeypairAddress', ''),
    agentMode,
    walletAddress: opt<string | null>('walletAddress', null),
    ownerWallet: opt<string | null>('ownerWallet', null),
    agentAssetAddress: opt<string | null>('agentAssetAddress', null),
    agentTokenMint: opt<string | null>('agentTokenMint', null),
    tokenOverride: opt<string | null>('tokenOverride', null),
    transactionSender: opt<AgentContext['transactionSender']>('transactionSender', null),
    txCounter: opt<AgentContext['txCounter']>('txCounter', null),
    dryRun: opt<boolean>('dryRun', false),
    maxSlippageBps: opt<number>('maxSlippageBps', 500),
    maxPriceImpactPct: opt<number>('maxPriceImpactPct', 2.0),
    agentFeeSol: opt<number>('agentFeeSol', 0.001),
    jupiterApiKey: opt<string | null>('jupiterApiKey', null),
    state: opt<AgentContext['state']>('state', null),
    onAssetRegistered: opt<AgentContext['onAssetRegistered']>('onAssetRegistered', null),
    onTokenLaunched: opt<AgentContext['onTokenLaunched']>('onTokenLaunched', null),
    ensureFunded: opt<AgentContext['ensureFunded']>('ensureFunded', null),
  };
}
