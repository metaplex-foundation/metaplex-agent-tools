/**
 * A `Capability` is a coarse-grained declaration of what a tool needs from
 * the host process. The toolset builder uses these to fail fast at assembly
 * time when an included tool requires something the host hasn't promised.
 *
 *   umi-rpc        — basic Solana RPC reachable via the runtime Umi factory
 *   agent-keypair  — AGENT_KEYPAIR loaded and able to sign transactions
 *   agent-identity — agent has been registered on-chain (AGENT_ASSET_ADDRESS set)
 *   agent-token    — agent has launched / been bound to a token (AGENT_TOKEN_MINT set)
 *   jupiter        — Jupiter swap API reachable (used by swap/buyback/sell)
 *   genesis        — Metaplex Genesis SDK in scope (token launches)
 *   registry       — Agent Registry program in scope (register, delegate)
 *   state-store    — agent-state.json read/write (autonomous-mode goals/tasks/journal)
 *   banner         — stderr is a real TTY-or-log destination for registration banners
 *
 * Capabilities describe *intent* — they do not health-check the underlying
 * service. A tool that lists `jupiter` will still fail at runtime if the
 * Jupiter API is down; the capability check just prevents wiring up tools
 * that obviously cannot work in this host.
 */
export type Capability =
  | 'umi-rpc'
  | 'agent-keypair'
  | 'agent-identity'
  | 'agent-token'
  | 'jupiter'
  | 'genesis'
  | 'registry'
  | 'state-store'
  | 'banner';

export const ALL_CAPABILITIES: readonly Capability[] = [
  'umi-rpc',
  'agent-keypair',
  'agent-identity',
  'agent-token',
  'jupiter',
  'genesis',
  'registry',
  'state-store',
  'banner',
] as const;

/**
 * A `ToolCategory` is used by `createToolset({ include: ['category:read'] })`
 * to select tools in bulk. Each tool declares exactly one category.
 *
 *   read             — RPC reads, no transaction or state mutation
 *   transfer         — user-signed transfers (public-mode-friendly)
 *   trade            — Jupiter swaps (agent-signed)
 *   treasury         — withdraw / fund — moves SOL owned by the agent
 *   registration     — register-agent, delegate-execution, launch-token
 *   autonomous-only  — goals, tasks, paused (working-memory toggles)
 *   utility          — non-domain helpers (e.g. sleep)
 */
export type ToolCategory =
  | 'read'
  | 'transfer'
  | 'trade'
  | 'treasury'
  | 'registration'
  | 'autonomous-only'
  | 'utility';
