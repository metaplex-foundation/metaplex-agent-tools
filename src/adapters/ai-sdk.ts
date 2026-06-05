// Vercel AI SDK adapter for framework-agnostic `ToolDescriptor`s.
//
// Tools authored against `ToolDescriptor` receive `AgentContext` at execute
// time. The AI SDK's `tool({ execute })` signature does NOT accept a host-
// provided per-call context — there is no `requestContext`-style channel.
// The host therefore has to close over `AgentContext` at adapter-creation
// time, which means a new `Record<string, Tool>` per chat turn.
//
// Concretely: in a chat handler, build the `AgentContext` for that request,
// call `toAISdkTools(descriptors, ctx)` once, pass the result into the AI
// SDK's `streamText({ tools })`. Do NOT cache the result across turns —
// the closure captures that turn's context, including the connected wallet
// and any per-tick limits.
import { tool, type Tool } from 'ai';
import type { ToolDescriptor } from '../descriptor.js';
import type { AgentContext } from '../internal/types/agent.js';
import { selectDescriptors } from '../internal/select-descriptors.js';
// Side-effect import: forces the tool registry to populate so the bundle
// builders below see every registered descriptor when the host calls
// them. Tools register themselves at module load via `defineTool(...)`.
import '../tools/index.js';

/**
 * Wrap a single `ToolDescriptor` into a Vercel AI SDK `Tool`. The supplied
 * `AgentContext` is captured by closure and passed to `descriptor.execute`
 * on every invocation.
 */
export function toAISdkTool<TInput, TResult>(
  descriptor: ToolDescriptor<TInput, TResult>,
  ctx: AgentContext,
): Tool {
  return tool({
    description: descriptor.description,
    inputSchema: descriptor.inputSchema as any,
    execute: (async (input: TInput) => {
      return descriptor.execute(input, ctx);
    }) as any,
  }) as Tool;
}

/**
 * Bulk convenience: wrap an array of descriptors into the
 * `Record<string, Tool>` shape `streamText({ tools })` expects. Keys are
 * camelCased ids (`get-balance` → `getBalance`) to match the historical
 * template export shape.
 */
export function toAISdkTools(
  descriptors: readonly ToolDescriptor<any, any>[],
  ctx: AgentContext,
): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const d of descriptors) {
    out[toCamel(d.id)] = toAISdkTool(d, ctx);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pre-built bundles mirroring the root `./bundles.ts` set, but each is a
// FUNCTION taking the host's per-turn `AgentContext`. The closure is
// rebuilt every call — never cache the result across chat turns, since
// the connected wallet / dry-run / tx-counter fields may have changed.
// ---------------------------------------------------------------------------

/** Read-only RPC tools — balances, prices, metadata, tx lookup. */
export const readOnlyBundle = (ctx: AgentContext): Record<string, Tool> =>
  toAISdkTools(selectDescriptors({ include: ['category:read'] }), ctx);

/** Jupiter trading — swap, buyback, sell. Requires `jupiter` + `agent-keypair`. */
export const tradingBundle = (ctx: AgentContext): Record<string, Tool> =>
  toAISdkTools(selectDescriptors({ include: ['category:trade'] }), ctx);

/** On-chain identity bootstrap — register, delegate, launch token. */
export const registrationBundle = (ctx: AgentContext): Record<string, Tool> =>
  toAISdkTools(selectDescriptors({ include: ['category:registration'] }), ctx);

/** User-signed SOL/SPL transfers (public-mode friendly). */
export const transferBundle = (ctx: AgentContext): Record<string, Tool> =>
  toAISdkTools(selectDescriptors({ include: ['category:transfer'] }), ctx);

/** Treasury movements (withdraw / fund). */
export const treasuryBundle = (ctx: AgentContext): Record<string, Tool> =>
  toAISdkTools(selectDescriptors({ include: ['category:treasury'] }), ctx);

/** Historical `publicAgentTools` replica — shared + transfer, no autonomous-only, no withdraw-sol. */
export const publicBundle = (ctx: AgentContext): Record<string, Tool> =>
  toAISdkTools(
    selectDescriptors({ exclude: ['category:autonomous-only', 'withdraw-sol'] }),
    ctx,
  );

/** Historical `autonomousAgentTools` replica — shared + autonomous-only, no user-facing transfers. */
export const autonomousBundle = (ctx: AgentContext): Record<string, Tool> =>
  toAISdkTools(selectDescriptors({ exclude: ['category:transfer'] }), ctx);

function toCamel(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
