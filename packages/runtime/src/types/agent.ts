import type { Umi } from '@metaplex-foundation/umi';

/**
 * Interface for sending transactions to the connected client and awaiting the result.
 *
 * In public mode, the server injects a real implementation that serializes the tx
 * over WebSocket, waits for the user to sign, and resolves with the signature.
 * Throws an error if the user rejects or a timeout/disconnect occurs.
 *
 * In autonomous mode, this is never called (tools sign and submit directly).
 */
export interface TransactionSender {
  /**
   * Send a transaction to the connected client, wait for user approval and signing,
   * and resolve with the confirmed signature.
   * Throws if rejected, timed out, or the client disconnected.
   */
  sendAndAwait(
    transactionBase64: string,
    options?: {
      message?: string;
      index?: number;
      total?: number;
      feeSol?: number;
    },
  ): Promise<string>;
}

/**
 * Per-tick transaction-submission counter. Held by the worker loop and
 * passed through `RequestContext` to `submitOrSend` so tools can't exceed
 * the host's tx-per-tick limit. Mutated by reference — same object lives
 * in `RequestContext` and in any `AgentContext` read.
 *
 * `null` everywhere outside the worker loop (chat path has no per-turn cap).
 */
export interface TxCounter {
  count: number;
  max: number;
}

// ---------------------------------------------------------------------------
// State store — implemented by the host, consumed by autonomous-only tools.
// ---------------------------------------------------------------------------

export interface Goal {
  id: string;
  description: string;
  createdAt: string;
  status: 'active' | 'achieved' | 'abandoned';
}

export interface Task {
  id: string;
  goalId: string | null;
  description: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  createdAt: string;
  completedAt: string | null;
  result: string | null;
}

export interface JournalEntry {
  ts: string;
  kind: 'tick' | 'goal_set' | 'pause' | 'unpause' | 'error';
  summary: string;
  txSigs: string[];
}

/**
 * The host (template / fork) provides a `StateStore` implementation that
 * the autonomous-mode tools (set-goal, close-goal, add-task, close-task,
 * set-paused) call. The default template implementation is file-backed
 * (`agent-state.json`); a fork can swap in Redis, Postgres, etc. without
 * touching the toolkit.
 */
export interface StateStore {
  addGoal(description: string): Goal;
  closeGoal(id: string, status: 'achieved' | 'abandoned'): Goal | null;
  getGoalById(id: string): Goal | null;
  addTask(description: string, goalId: string | null): Task;
  closeTask(id: string, status: 'done' | 'failed', result: string): Task | null;
  setPaused(paused: boolean, reason?: string): void;
  appendJournal(entry: Omit<JournalEntry, 'ts'> & { ts?: string }): JournalEntry;
}

// ---------------------------------------------------------------------------
// AgentContext — the full set of values tools read at execute time.
// ---------------------------------------------------------------------------

/**
 * `AgentContext` is the union of every value the toolkit's tools read from
 * `RequestContext`. The host (template) constructs this once per request /
 * tick / turn and passes it via `new RequestContext([...])`.
 *
 * The toolkit's tools NEVER call `getConfig()`, `getState()`, or
 * `createUmi()` — every value they need lives here. This keeps tools pure
 * and free of process-globals, which makes them testable and reusable
 * across host implementations.
 */
export interface AgentContext {
  // --- Solana runtime ---
  /** Umi instance with the agent keypair loaded as identity/payer. */
  umi: Umi;
  /** 'solana-mainnet' or 'solana-devnet' — used by SDKs that need a network tag. */
  network: 'solana-mainnet' | 'solana-devnet';

  // --- Mode + identity ---
  agentMode: 'public' | 'autonomous';
  /** Base58 pubkey of the agent's hot keypair (umi.identity.publicKey as string). */
  agentKeypairAddress: string;
  /** Connected user wallet (chat path) or owner (worker loop). null pre-handshake. */
  walletAddress: string | null;
  /** Resolved on-chain owner of the agent asset, or BOOTSTRAP_WALLET fallback. */
  ownerWallet: string | null;
  /** Set after register-agent succeeds. Persisted by host via onAssetRegistered. */
  agentAssetAddress: string | null;
  /** Set after launch-token succeeds. Persisted by host via onTokenLaunched. */
  agentTokenMint: string | null;
  /** Hosted-agent override: buy back this mint instead of launching the agent's own. */
  tokenOverride: string | null;

  // --- Transaction submission ---
  /** Sends to connected user wallet over WebSocket (public mode). null in autonomous. */
  transactionSender: TransactionSender | null;
  /** Per-tick cap on agent-signed tx submissions (autonomous). null in chat path. */
  txCounter: TxCounter | null;
  /** When true, submitAsAgent logs and returns a DRYRUN_* signature instead of broadcasting. */
  dryRun: boolean;

  // --- Limits / behavior ---
  /** Cap on swap slippage in basis points (e.g. 500 = 5%). */
  maxSlippageBps: number;
  /** Cap on Jupiter quote priceImpactPct (e.g. 2.0 = 2%). */
  maxPriceImpactPct: number;
  /** Fee charged to user for public-mode tx (added to the user-signed tx). */
  agentFeeSol: number;

  // --- Optional integrations ---
  /** Jupiter API key. Optional — Jupiter falls back to free tier without it. */
  jupiterApiKey: string | null;

  // --- State store (autonomous-only tools) ---
  /** State accessor for goals/tasks/journal. null in chat-only deployments. */
  state: StateStore | null;

  // --- Side-effect callbacks (host-implemented) ---
  /**
   * Called after register-agent successfully creates the asset.
   * Host persists the address, clears owner cache, prints banner, etc.
   */
  onAssetRegistered: ((address: string) => void) | null;
  /**
   * Called after launch-token successfully mints. Host persists the mint,
   * prints banner, etc.
   */
  onTokenLaunched: ((mint: string) => void) | null;
  /**
   * Called by register-agent before submission to ensure the agent keypair
   * has enough SOL to pay gas. Public-mode hosts wire this to ensureAgentFunded
   * (which can pull from the connected user wallet). Pass null to skip.
   */
  ensureFunded: (() => Promise<void>) | null;
}
