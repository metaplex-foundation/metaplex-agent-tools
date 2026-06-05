import { createTool, type ToolAction } from '@mastra/core/tools';
import type { z } from 'zod';
import type { Capability, ToolCategory } from './capabilities.js';
import { registerTool } from './registry.js';
import { defineToolDescriptor, type ToolDescriptor } from './descriptor.js';
import type { AgentContext } from './internal/types/agent.js';

/**
 * A `ToolDefinition` IS a Mastra `ToolAction` (same shape: `id`, `description`,
 * schemas, `execute`) plus the tool library-specific metadata attached as extra
 * properties. Consumers can:
 *   - pass it directly to `new Agent({ tools: { foo: setGoal } })`
 *   - read `setGoal.authLevel`, `setGoal.requires`, `setGoal.category`
 *   - call `setGoal.execute(args, ctx)` in tests
 *
 * The toolset builder still wraps `.execute` with `withAuth` at assembly time.
 */
export type ToolDefinition = ToolAction<any, any, any> & {
  readonly authLevel: string;
  readonly requires: readonly Capability[];
  readonly category: ToolCategory;
  /**
   * The framework-agnostic descriptor this tool was built from. Adapters
   * (and contract tests) read this to reconstruct the underlying tool for
   * a different framework without going through Mastra's wrapper.
   */
  readonly descriptor: ToolDescriptor<any, any>;
};

export interface DefineToolArgs<
  I extends z.ZodTypeAny,
  O extends z.ZodTypeAny,
> {
  id: string;
  description: string;
  authLevel: string;
  requires: readonly Capability[];
  category: ToolCategory;
  inputSchema: I;
  outputSchema: O;
  execute: (
    args: z.infer<I>,
    ctx: { requestContext?: any },
  ) => Promise<z.infer<O>>;
}

/**
 * Build a `RequestContext`-shaped object (the `{ get(key) }` map Mastra
 * passes to tools) from a populated `AgentContext`. Used by the
 * backwards-compat `defineTool` shim so legacy tool bodies that destructure
 * `{ requestContext }` keep working when called through a non-Mastra adapter
 * (e.g. the AI SDK adapter, which passes `AgentContext` directly).
 */
function agentContextAsRequestContext(ctx: AgentContext): { get: (key: string) => unknown } {
  return {
    get: (key: string) => (ctx as unknown as Record<string, unknown>)[key],
  };
}

/**
 * Author a tool. Builds a framework-agnostic `ToolDescriptor` from the args,
 * then wraps it into a Mastra `ToolAction` for backwards compatibility with
 * existing consumers (the template, `createToolset`, the bundles re-exported
 * from the root). The Mastra wiring itself lives in `./adapters/mastra` so
 * non-Mastra hosts can import the descriptor directly.
 *
 * Registers the resulting definition in the in-memory registry as a
 * side-effect of evaluation — importing the module containing a
 * `defineTool(...)` call is enough to make the tool discoverable.
 */
export function defineTool<
  I extends z.ZodTypeAny,
  O extends z.ZodTypeAny,
>(args: DefineToolArgs<I, O>): ToolDefinition {
  // Adapt the legacy `(input, { requestContext })` execute signature to the
  // descriptor's `(input, AgentContext)` signature. Adapters call the
  // descriptor with a real `AgentContext`; we rebuild a `RequestContext`-
  // shaped map and hand it to the original body so existing tool files
  // (which call `readAgentContext(requestContext)`) keep working.
  const descriptor = defineToolDescriptor<z.infer<I>, z.infer<O>>({
    id: args.id,
    description: args.description,
    inputSchema: args.inputSchema as unknown as z.ZodType<z.infer<I>>,
    authLevel: args.authLevel,
    requires: args.requires,
    category: args.category,
    execute: async (input, agentCtx) => {
      return args.execute(input, {
        requestContext: agentContextAsRequestContext(agentCtx),
      });
    },
  });

  const tool = createTool({
    id: args.id,
    description: args.description,
    inputSchema: args.inputSchema,
    outputSchema: args.outputSchema,
    execute: args.execute as any,
  });
  // Attach metadata as non-enumerable so consumers spreading the tool
  // into `Agent({ tools: { ...x } })` don't get junk keys.
  Object.defineProperties(tool, {
    authLevel: { value: args.authLevel, enumerable: false, writable: false },
    requires: { value: args.requires, enumerable: false, writable: false },
    category: { value: args.category, enumerable: false, writable: false },
    descriptor: { value: descriptor, enumerable: false, writable: false },
  });
  const def = tool as ToolDefinition;
  registerTool(def);
  return def;
}
