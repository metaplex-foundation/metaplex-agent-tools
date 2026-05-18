import { createTool, type ToolAction } from '@mastra/core/tools';
import type { z } from 'zod';
import type { Capability, ToolCategory } from './capabilities.js';
import { registerTool } from './registry.js';

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
 * Author a tool. Wraps Mastra's `createTool` and attaches the tool library
 * metadata (`authLevel`, `requires`, `category`) as non-enumerable
 * properties so they don't pollute object spreads.
 *
 * Registers the resulting definition in the in-memory registry as a
 * side-effect of evaluation — importing the module containing a
 * `defineTool(...)` call is enough to make the tool discoverable.
 */
export function defineTool<
  I extends z.ZodTypeAny,
  O extends z.ZodTypeAny,
>(args: DefineToolArgs<I, O>): ToolDefinition {
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
  });
  const def = tool as ToolDefinition;
  registerTool(def);
  return def;
}
