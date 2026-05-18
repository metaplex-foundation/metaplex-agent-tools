import { createTool, type ToolAction } from '@mastra/core/tools';
import type { z } from 'zod';
import type { Capability, ToolCategory } from './capabilities.js';
import { registerTool } from './registry.js';

/**
 * A `ToolDefinition` is the toolkit's canonical record for one tool. It
 * carries the Mastra `tool` (built via `createTool`) plus the metadata the
 * toolset builder needs to decide whether the tool can be included in a
 * given host and how to gate it.
 */
export interface ToolDefinition {
  id: string;
  authLevel: string;
  requires: readonly Capability[];
  category: ToolCategory;
  tool: ToolAction<any, any, any>;
}

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
 * Author a tool. Wraps Mastra's `createTool` and attaches the metadata
 * (`authLevel`, `requires`, `category`) the toolset builder consumes.
 *
 * Registers the resulting definition in the in-memory registry as a
 * side-effect of evaluation — importing the module that contains a
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
  const def: ToolDefinition = {
    id: args.id,
    authLevel: args.authLevel,
    requires: args.requires,
    category: args.category,
    tool,
  };
  registerTool(def);
  return def;
}
