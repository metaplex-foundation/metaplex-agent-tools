import {
  withAuth,
  defaultAuthPolicy,
  type AuthPolicy,
} from './internal/index.js';
import type { ToolAction } from './adapters/mastra.js';
import { type Capability } from './capabilities.js';
import { listRegisteredTools } from './registry.js';
import { selectDescriptors, type ToolSelector } from './internal/select-descriptors.js';

export type { ToolSelector };

export interface CreateToolsetOptions {
  /**
   * Tools to include. Defaults to every registered tool.
   * Resolved BEFORE `exclude` — so `include: ['*'], exclude: ['withdraw-sol']`
   * does what you'd expect.
   */
  include?: readonly ToolSelector[];
  /** Tools to subtract from the included set. Defaults to none. */
  exclude?: readonly ToolSelector[];
  /** Override the default public/owner auth policy. */
  authPolicy?: AuthPolicy;
  /**
   * Capabilities this host can fulfil. Defaults to declaring every
   * capability — i.e. the same fail-at-runtime behavior the toolset has
   * today. Pass a tighter list to fail fast at build time if any included
   * tool requires a capability the host doesn't provide.
   */
  capabilities?: readonly Capability[];
}

/**
 * Build a `Record<string, Tool>` ready to pass to `new Agent({ tools })`.
 *
 * Internally delegates id/category/capability resolution to
 * `selectDescriptors`, then maps each selected descriptor back to its
 * registered `ToolDefinition` and applies `withAuth`. Keys are camelCased
 * tool ids (`get-balance` → `getBalance`) to preserve compatibility with
 * the existing template's export shape.
 *
 * Throws synchronously on:
 *   - unknown id / category in `include` / `exclude`
 *   - any included tool whose `requires` isn't a subset of `capabilities`
 */
export function createToolset(
  opts: CreateToolsetOptions = {},
): Record<string, ToolAction<any, any, any>> {
  const policy = opts.authPolicy ?? defaultAuthPolicy;
  const descriptors = selectDescriptors({
    include: opts.include,
    exclude: opts.exclude,
    capabilities: opts.capabilities,
  });

  // Map descriptors back to the registered Mastra-wrapped ToolDefinitions
  // — `withAuth` mutates the wrapped tool's execute in place, so we must
  // operate on the same object identities the registry holds.
  const registered = new Map(listRegisteredTools().map((d) => [d.id, d]));
  const result: Record<string, ToolAction<any, any, any>> = {};
  for (const descriptor of descriptors) {
    const def = registered.get(descriptor.id);
    if (!def) continue; // unreachable — selectDescriptors filters from the same registry
    const wrapped = withAuth(def, def.authLevel, policy);
    result[toCamel(def.id)] = wrapped;
  }

  return result;
}

function toCamel(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
