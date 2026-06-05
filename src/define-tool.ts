import type { z } from 'zod';
import type { Capability, ToolCategory } from './capabilities.js';
import { registerTool } from './registry.js';
import { defineToolDescriptor, type ToolDescriptor } from './descriptor.js';
import type { AgentContext } from './internal/types/agent.js';
import { legacyMastraWrap, type ToolAction } from './adapters/mastra.js';

/**
 * A `ToolDefinition` IS a Mastra `ToolAction` (same shape: `id`, `description`,
 * schemas, `execute`) plus the tool library-specific metadata attached as extra
 * properties. Consumers can:
 *   - pass it directly to `new Agent({ tools: { foo: setGoal } })`
 *   - read `setGoal.authLevel`, `setGoal.requires`, `setGoal.category`
 *   - call `setGoal.execute(args, ctx)` in tests
 *
 * The toolset builder still wraps `.execute` with `withAuth` at assembly time.
 *
 * The `descriptor` slot exposes the framework-agnostic source-of-truth
 * (`ToolDescriptor`) that adapters and contract tests round-trip through.
 */
export type ToolDefinition = ToolAction<any, any, any> & {
  readonly authLevel: string;
  readonly requires: readonly Capability[];
  readonly category: ToolCategory;
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
 * then hands it to the Mastra adapter for backwards compatibility with
 * existing consumers (the template, `createToolset`, the root-exported
 * bundles). The Mastra wiring itself lives in `./adapters/mastra` so
 * non-Mastra hosts can import descriptors directly.
 *
 * Registers the resulting definition in the in-memory registry as a
 * side-effect of evaluation — importing the module containing a
 * `defineTool(...)` call is enough to make the tool discoverable.
 */
export function defineTool<
  I extends z.ZodTypeAny,
  O extends z.ZodTypeAny,
>(args: DefineToolArgs<I, O>): ToolDefinition {
  // Build a descriptor whose execute accepts a real `AgentContext` and
  // internally re-packs it into a `{ requestContext }`-shaped map so the
  // caller's existing tool body (which destructures `requestContext`)
  // keeps working when invoked through any adapter, including ones that
  // don't have a Mastra-style request context.
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

  // Preserve historical Mastra behavior bit-for-bit: the wrapped tool's
  // execute is the caller's original function (Mastra parses input, then
  // forwards). Adapters wanting the descriptor-shaped execute should read
  // `def.descriptor` and re-wrap via `toMastraTool` / `toAISdkTool`.
  const def = legacyMastraWrap({
    id: args.id,
    description: args.description,
    inputSchema: args.inputSchema,
    outputSchema: args.outputSchema,
    execute: args.execute as any,
    authLevel: args.authLevel,
    requires: args.requires,
    category: args.category,
    descriptor,
  }) as ToolDefinition;

  registerTool(def);
  return def;
}
