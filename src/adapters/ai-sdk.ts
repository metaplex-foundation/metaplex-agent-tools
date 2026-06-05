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

function toCamel(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
