import { RequestContext } from '@mastra/core/request-context';
import {
  createSignerFromKeypair,
  signerIdentity,
  type Umi,
} from '@metaplex-foundation/umi';
import { createUmi as createUmiBase } from '@metaplex-foundation/umi-bundle-defaults';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import type { StateStore } from '../../src/index.js';
import bs58 from 'bs58';

export interface FakeContextOpts {
  umi?: Umi;
  network?: 'solana-mainnet' | 'solana-devnet';
  agentKeypairAddress?: string;
  walletAddress?: string;
  agentMode?: 'public' | 'autonomous';
  agentAssetAddress?: string | null;
  agentTokenMint?: string | null;
  agentFeeSol?: number;
  tokenOverride?: string | null;
  ownerWallet?: string;
  transactionSender?: { sendAndAwait: (b64: string, opts?: unknown) => Promise<string> } | ((b64: string) => Promise<string>);
  abortSignal?: AbortSignal;
  txCounter?: { count: number; max: number };
  dryRun?: boolean;
  maxSlippageBps?: number;
  maxPriceImpactPct?: number;
  jupiterApiKey?: string | null;
  state?: StateStore | null;
  onAssetRegistered?: ((address: string) => void) | null;
  onTokenLaunched?: ((mint: string) => void) | null;
  ensureFunded?: (() => Promise<void>) | null;
}

/**
 * Build a `RequestContext` populated with every `AgentContext` field tools
 * may read. Test seam — production hosts build their own ToolHostContext.
 *
 * Defaults (overridable via `opts`):
 *   - `umi`              — built from `process.env.SOLANA_RPC_URL` + `AGENT_KEYPAIR`.
 *                          Tests typically set these via `isolateEnv(...)`.
 *   - `dryRun`           — reads `process.env.AUTONOMOUS_DRY_RUN` (boolean).
 *   - `jupiterApiKey`    — reads `process.env.JUPITER_API_KEY` if present.
 *   - `network`          — inferred from RPC URL ('devnet' substring → solana-devnet).
 */
export function fakeContext(opts: FakeContextOpts = {}): RequestContext {
  const umi = opts.umi ?? buildUmiFromEnv();
  const agentKeypairAddress = opts.agentKeypairAddress ?? umi.identity.publicKey.toString();

  let sender: { sendAndAwait: (b64: string, opts?: any) => Promise<string> } | null = null;
  if (opts.transactionSender) {
    if (typeof opts.transactionSender === 'function') {
      const fn = opts.transactionSender;
      sender = { sendAndAwait: (b64) => fn(b64) };
    } else {
      sender = opts.transactionSender as any;
    }
  }

  const network: 'solana-mainnet' | 'solana-devnet' =
    opts.network ??
    ((process.env.SOLANA_RPC_URL ?? '').includes('devnet') ? 'solana-devnet' : 'solana-mainnet');

  const dryRunDefault =
    process.env.AUTONOMOUS_DRY_RUN === 'true' ||
    process.env.AUTONOMOUS_DRY_RUN === '1';

  const entries: [string, unknown][] = [
    ['umi', umi],
    ['network', network],
    ['agentMode', opts.agentMode ?? 'public'],
    ['agentKeypairAddress', agentKeypairAddress],
    ['walletAddress', opts.walletAddress ?? 'OwnerWalletAddressPlaceholder1111111111111'],
    ['ownerWallet', opts.ownerWallet ?? 'OwnerWalletAddressPlaceholder1111111111111'],
    ['agentAssetAddress', opts.agentAssetAddress ?? null],
    ['agentTokenMint', opts.agentTokenMint ?? null],
    ['tokenOverride', opts.tokenOverride ?? null],
    ['transactionSender', sender],
    ['txCounter', opts.txCounter ?? null],
    ['dryRun', opts.dryRun ?? dryRunDefault],
    ['maxSlippageBps', opts.maxSlippageBps ?? 500],
    ['maxPriceImpactPct', opts.maxPriceImpactPct ?? 2.0],
    ['agentFeeSol', opts.agentFeeSol ?? 0],
    ['jupiterApiKey', opts.jupiterApiKey ?? process.env.JUPITER_API_KEY ?? null],
    ['state', opts.state ?? null],
    ['onAssetRegistered', opts.onAssetRegistered ?? null],
    ['onTokenLaunched', opts.onTokenLaunched ?? null],
    ['ensureFunded', opts.ensureFunded ?? null],
    ['abortSignal', opts.abortSignal ?? new AbortController().signal],
  ];
  return new RequestContext(entries);
}

/**
 * Build a Umi from process.env. Tests pre-install `SOLANA_RPC_URL` and
 * `AGENT_KEYPAIR` via `isolateEnv(...)`; this mirrors what the old
 * `createUmi()` factory used to do.
 *
 * Falls back to `http://127.0.0.1:1/` (unroutable) + a random keypair so
 * tests that only exercise validation gates don't crash on missing env.
 */
function buildUmiFromEnv(): Umi {
  const rpcUrl = process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:1/';
  const umi = createUmiBase(rpcUrl).use(mplToolbox());

  const raw = (process.env.AGENT_KEYPAIR ?? '').trim();
  let secretKey: Uint8Array;
  if (raw.startsWith('[')) {
    secretKey = new Uint8Array(JSON.parse(raw));
  } else if (raw.length > 0) {
    secretKey = bs58.decode(raw);
  } else {
    // No keypair in env — generate one so umi.identity is always populated.
    // Tools that need a specific address should override via `opts.umi`.
    secretKey = new Uint8Array(64);
    crypto.getRandomValues(secretKey);
    // Derive a valid Ed25519 keypair from the random seed via Umi's eddsa.
    const kp = umi.eddsa.generateKeypair();
    secretKey = kp.secretKey;
  }

  const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  const signer = createSignerFromKeypair(umi, keypair);
  umi.use(signerIdentity(signer));
  return umi;
}
