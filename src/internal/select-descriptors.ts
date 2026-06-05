import { ALL_CAPABILITIES, type Capability, type ToolCategory } from '../capabilities.js';
import { listRegisteredTools } from '../registry.js';
import type { ToolDescriptor } from '../descriptor.js';

/**
 * A selector is one of:
 *   - a tool id (e.g. `'get-balance'`)
 *   - the literal `'*'` — every registered tool
 *   - `'category:<name>'` — every tool whose `category` matches
 */
export type ToolSelector = string;

export interface SelectDescriptorsOptions {
  /**
   * Tools to include. Defaults to every registered tool. Resolved BEFORE
   * `exclude` — so `include: ['*'], exclude: ['withdraw-sol']` does what
   * you'd expect.
   */
  include?: readonly ToolSelector[];
  /** Tools to subtract from the included set. Defaults to none. */
  exclude?: readonly ToolSelector[];
  /**
   * Capabilities this host can fulfil. Defaults to declaring every
   * capability — i.e. the same fail-at-runtime behavior the toolset has
   * today. Pass a tighter list to fail fast at build time if any included
   * tool requires a capability the host doesn't provide.
   */
  capabilities?: readonly Capability[];
}

/**
 * Resolve include/exclude/capabilities into a deterministic, framework-
 * agnostic ordered list of `ToolDescriptor`s. Used by:
 *   - `createToolset` (root) — wraps results in Mastra ToolActions
 *   - `./adapters/mastra` bundles — wraps results in Mastra ToolActions
 *   - `./adapters/ai-sdk` bundles — wraps results in AI SDK Tools
 *
 * Throws synchronously on:
 *   - unknown id / category in `include` / `exclude`
 *   - any included tool whose `requires` isn't a subset of `capabilities`
 */
export function selectDescriptors(
  opts: SelectDescriptorsOptions = {},
): ToolDescriptor<any, any>[] {
  const caps = new Set<Capability>(opts.capabilities ?? ALL_CAPABILITIES);
  const all = listRegisteredTools();
  const allIds = new Set(all.map((t) => t.id));
  const allCats = new Set(all.map((t) => t.category));

  const resolve = (selectors: readonly ToolSelector[]): Set<string> => {
    const out = new Set<string>();
    for (const s of selectors) {
      if (s === '*') {
        for (const t of all) out.add(t.id);
        continue;
      }
      if (s.startsWith('category:')) {
        const cat = s.slice('category:'.length) as ToolCategory;
        if (!allCats.has(cat)) {
          throw new Error(
            `selectDescriptors: unknown category "${cat}". Known categories: ${Array.from(allCats).sort().join(', ')}.`,
          );
        }
        for (const t of all) if (t.category === cat) out.add(t.id);
        continue;
      }
      if (!allIds.has(s)) {
        throw new Error(
          `selectDescriptors: unknown tool id "${s}". Known ids: ${Array.from(allIds).sort().join(', ')}.`,
        );
      }
      out.add(s);
    }
    return out;
  };

  const included = opts.include ? resolve(opts.include) : new Set<string>(allIds);
  const excluded = opts.exclude ? resolve(opts.exclude) : new Set<string>();
  const finalIds = new Set<string>(
    Array.from(included).filter((id) => !excluded.has(id)),
  );

  const missingCaps: Record<string, Capability[]> = {};
  const out: ToolDescriptor<any, any>[] = [];
  for (const def of all) {
    if (!finalIds.has(def.id)) continue;
    const missing = def.requires.filter((c) => !caps.has(c));
    if (missing.length > 0) {
      missingCaps[def.id] = [...missing];
      continue;
    }
    out.push(def.descriptor);
  }

  if (Object.keys(missingCaps).length > 0) {
    const lines = Object.entries(missingCaps).map(
      ([id, ms]) => `  ${id}: missing ${ms.join(', ')}`,
    );
    throw new Error(
      `selectDescriptors: included tools require capabilities not provided by this host:\n${lines.join('\n')}\n\nEither pass a wider \`capabilities\` list, exclude the offending tools, or drop them from \`include\`.`,
    );
  }

  return out;
}
