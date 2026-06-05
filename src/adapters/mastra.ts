import { createTool, type ToolAction } from '@mastra/core/tools';
import { readAgentContext } from '../internal/context.js';
import { withAuth, defaultAuthPolicy, type AuthPolicy } from '../internal/auth.js';
import { selectDescriptors } from '../internal/select-descriptors.js';
import type { ToolDescriptor } from '../descriptor.js';

/**
 * Re-export the Mastra `ToolAction` type so `define-tool.ts` (and
 * downstream consumers that only want the type, not the runtime) can
 * import it without depending on `@mastra/core/tools` directly.
 */
export type { ToolAction } from '@mastra/core/tools';

/**
 * Mastra adapter for framework-agnostic `ToolDescriptor`s. The wrapped
 * tool's `execute` materializes `AgentContext` out of Mastra's
 * `requestContext` and forwards it to the descriptor.
 *
 * Hosts using `defineTool` (the legacy shim) end up here transparently —
 * `defineTool` builds a descriptor whose `execute` re-packs the
 * `AgentContext` into a `{ requestContext }`-shaped map so existing tool
 * bodies keep working.
 *
 * External authors importing from `@metaplex-foundation/agent-tools/mastra`
 * can wrap their own descriptors directly.
 */
export function toMastraTool<TInput, TResult>(
  descriptor: ToolDescriptor<TInput, TResult>,
  options: { authPolicy?: AuthPolicy } = {},
): ToolAction<any, any, any> {
  const policy = options.authPolicy ?? defaultAuthPolicy;
  const tool = createTool({
    id: descriptor.id,
    description: descriptor.description,
    inputSchema: descriptor.inputSchema as any,
    execute: async (input: unknown, ctx: any) => {
      const agentCtx = readAgentContext(ctx?.requestContext);
      return descriptor.execute(input as TInput, agentCtx);
    },
  });

  // Attach metadata as non-enumerable so consumers spreading the tool
  // into `Agent({ tools: { ...x } })` don't get junk keys. Matches the
  // legacy `defineTool` shape exactly.
  Object.defineProperties(tool, {
    authLevel: { value: descriptor.authLevel, enumerable: false, writable: false },
    requires: {
      value: descriptor.requires ?? [],
      enumerable: false,
      writable: false,
    },
    category: { value: descriptor.category, enumerable: false, writable: false },
    descriptor: { value: descriptor, enumerable: false, writable: false },
  });

  // Apply withAuth in place — same behavior as the historical createToolset.
  return withAuth(tool as ToolAction<any, any, any>, descriptor.authLevel, policy);
}

/**
 * Bulk convenience: wrap an array of descriptors into the
 * `Record<string, ToolAction>` shape Mastra's `Agent({ tools })` expects.
 * Keys are camelCased ids (`get-balance` → `getBalance`) to match the
 * historical template export shape.
 */
export function toMastraTools(
  descriptors: readonly ToolDescriptor<any, any>[],
  options: { authPolicy?: AuthPolicy } = {},
): Record<string, ToolAction<any, any, any>> {
  const out: Record<string, ToolAction<any, any, any>> = {};
  for (const d of descriptors) {
    out[toCamel(d.id)] = toMastraTool(d, options);
  }
  return out;
}

/**
 * Legacy compatibility helper used by the root `defineTool` shim. Takes
 * the original `defineTool`-style args (which include `outputSchema` and
 * an execute with a `{ requestContext }` ctx signature) and produces a
 * Mastra tool that preserves the historical behavior bit-for-bit —
 * specifically, the underlying `execute` is the caller's original function
 * (Mastra parses the input, then forwards it directly), no
 * `readAgentContext` round-trip in the hot path.
 *
 * Lives in this adapter file so `define-tool.ts` no longer imports from
 * `@mastra/core/tools` directly.
 */
export function legacyMastraWrap(args: {
  id: string;
  description: string;
  inputSchema: any;
  outputSchema: any;
  execute: (input: any, ctx: any) => Promise<any>;
  authLevel: string;
  requires: readonly any[];
  category: string;
  descriptor: ToolDescriptor<any, any>;
}): ToolAction<any, any, any> {
  const tool = createTool({
    id: args.id,
    description: args.description,
    inputSchema: args.inputSchema,
    outputSchema: args.outputSchema,
    execute: args.execute,
  });
  Object.defineProperties(tool, {
    authLevel: { value: args.authLevel, enumerable: false, writable: false },
    requires: { value: args.requires, enumerable: false, writable: false },
    category: { value: args.category, enumerable: false, writable: false },
    descriptor: { value: args.descriptor, enumerable: false, writable: false },
  });
  return tool as ToolAction<any, any, any>;
}

// ---------------------------------------------------------------------------
// Pre-built bundles, mirroring the root `./bundles.ts` set. Importing these
// from the `/mastra` subpath instead of the root signals that the host is
// explicitly opting into the Mastra adapter — useful for tooling that
// wants to be framework-explicit and for tree-shaking.
//
// Bundles are lazy: the first access triggers `./tools/index.js` to
// populate the registry, then materializes the Mastra tools. This avoids
// a circular-import order hazard with the in-package tool files (which
// import `defineTool` → which imports this adapter file).
// ---------------------------------------------------------------------------

function lazyBundle(
  options: Parameters<typeof selectDescriptors>[0],
): Record<string, ToolAction<any, any, any>> {
  let cached: Record<string, ToolAction<any, any, any>> | null = null;
  // Build once on first property access. Use a Proxy so the export looks
  // like a plain object to consumers (`'getBalance' in bundle`,
  // `Object.keys(bundle)`, etc. — all work).
  return new Proxy({} as Record<string, ToolAction<any, any, any>>, {
    get(_target, key) {
      if (cached === null) cached = buildBundle(options);
      return (cached as any)[key as any];
    },
    has(_target, key) {
      if (cached === null) cached = buildBundle(options);
      return key in cached;
    },
    ownKeys(_target) {
      if (cached === null) cached = buildBundle(options);
      return Reflect.ownKeys(cached);
    },
    getOwnPropertyDescriptor(_target, key) {
      if (cached === null) cached = buildBundle(options);
      return Object.getOwnPropertyDescriptor(cached, key);
    },
  });
}

function buildBundle(
  options: Parameters<typeof selectDescriptors>[0],
): Record<string, ToolAction<any, any, any>> {
  return toMastraTools(selectDescriptors(options));
}

/** Read-only RPC tools — balances, prices, metadata, tx lookup. */
export const readOnlyBundle = lazyBundle({ include: ['category:read'] });

/** Jupiter trading — swap, buyback, sell. Requires `jupiter` + `agent-keypair`. */
export const tradingBundle = lazyBundle({ include: ['category:trade'] });

/** On-chain identity bootstrap — register, delegate, launch token. */
export const registrationBundle = lazyBundle({
  include: ['category:registration'],
});

/** User-signed SOL/SPL transfers (public-mode friendly). */
export const transferBundle = lazyBundle({ include: ['category:transfer'] });

/** Treasury movements (withdraw / fund). */
export const treasuryBundle = lazyBundle({ include: ['category:treasury'] });

/** Historical `publicAgentTools` replica — shared + transfer, no autonomous-only, no withdraw-sol. */
export const publicBundle = lazyBundle({
  exclude: ['category:autonomous-only', 'withdraw-sol'],
});

/** Historical `autonomousAgentTools` replica — shared + autonomous-only, no user-facing transfers. */
export const autonomousBundle = lazyBundle({ exclude: ['category:transfer'] });

function toCamel(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
