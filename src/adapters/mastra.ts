import { createTool, type ToolAction } from '@mastra/core/tools';
import { readAgentContext } from '../internal/context.js';
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
): ToolAction<any, any, any> {
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

  return tool as ToolAction<any, any, any>;
}

/**
 * Bulk convenience: wrap an array of descriptors into the
 * `Record<string, ToolAction>` shape Mastra's `Agent({ tools })` expects.
 * Keys are camelCased ids (`get-balance` → `getBalance`) to match the
 * historical template export shape.
 */
export function toMastraTools(
  descriptors: readonly ToolDescriptor<any, any>[],
): Record<string, ToolAction<any, any, any>> {
  const out: Record<string, ToolAction<any, any, any>> = {};
  for (const d of descriptors) {
    out[toCamel(d.id)] = toMastraTool(d);
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

function toCamel(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
