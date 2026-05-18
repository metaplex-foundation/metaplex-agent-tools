import type { ToolDefinition } from './define-tool.js';

const _registry = new Map<string, ToolDefinition>();

/**
 * Register a tool definition. Throws on duplicate id — tools are global
 * singletons keyed by id, and a duplicate is almost always a copy-paste
 * mistake the author wants surfaced loudly.
 */
export function registerTool(def: ToolDefinition): void {
  if (_registry.has(def.id)) {
    throw new Error(`Tool already registered: ${def.id}`);
  }
  _registry.set(def.id, def);
}

export function getRegisteredTool(id: string): ToolDefinition | undefined {
  return _registry.get(id);
}

export function listRegisteredTools(): ToolDefinition[] {
  return Array.from(_registry.values());
}

/**
 * Test-only: drop every registered tool. Production code should never call
 * this — `defineTool` registers its return value at module load and the
 * registry is meant to be append-only for the process lifetime.
 */
export function _resetRegistryForTests(): void {
  _registry.clear();
}
