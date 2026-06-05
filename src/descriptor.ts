import type { z } from 'zod';
import type { Capability, ToolCategory } from './capabilities.js';
import type { AgentContext } from './internal/types/agent.js';

/**
 * Framework-agnostic auth level. The defaults shipped here are `'public'`
 * and `'owner'` (see `defaultAuthPolicy` in `internal/auth.ts`); hosts may
 * supply additional levels via a custom `AuthPolicy`. Kept as `string` so
 * fork policies can extend the vocabulary without touching this package.
 */
export type AuthLevel = string;

/**
 * `ToolDescriptor` is the framework-agnostic shape of a tool. It carries
 * every piece of metadata + the `execute` function that the package's
 * adapters (`./adapters/mastra`, `./adapters/ai-sdk`, …) wrap into a
 * framework-specific tool.
 *
 * The descriptor itself never imports a framework. Adapters do.
 *
 * `execute` is called with the parsed input and a fully populated
 * `AgentContext`. Adapters are responsible for materializing that context
 * (Mastra reads it out of `requestContext`; AI SDK closes over a
 * per-chat-turn context at adapter-creation time).
 */
export interface ToolDescriptor<TInput = unknown, TResult = unknown> {
  id: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  authLevel: AuthLevel;
  requires?: readonly Capability[];
  category: ToolCategory;
  execute: (input: TInput, ctx: AgentContext) => Promise<TResult>;
}

/**
 * Identity-with-typing helper. Validates the descriptor shape at the call
 * site and returns it unchanged so downstream adapters can consume it.
 *
 * Does NOT register the descriptor — registration is a side effect of
 * `defineTool`, which is the path used by the in-package tool catalog.
 * External authors writing descriptors directly should pass them through
 * the appropriate adapter (`toMastraTool`, `toAISdkTool`, …) themselves.
 */
export function defineToolDescriptor<TInput, TResult>(
  args: ToolDescriptor<TInput, TResult>,
): ToolDescriptor<TInput, TResult> {
  return args;
}
