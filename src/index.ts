// Side-effect import: evaluating each tool file registers its definition
// in the in-memory registry. Consumers that only call `createToolset`
// or import bundles rely on this happening before their call.
import './tools/index.js';

// Tool-specific API
export { defineTool, type ToolDefinition, type DefineToolArgs } from './define-tool.js';
export {
  defineToolDescriptor,
  type ToolDescriptor,
  type AuthLevel,
} from './descriptor.js';
export {
  ALL_CAPABILITIES,
  type Capability,
  type ToolCategory,
} from './capabilities.js';
export {
  createToolset,
  type CreateToolsetOptions,
  type ToolSelector,
} from './toolset.js';
export {
  readOnlyBundle,
  tradingBundle,
  registrationBundle,
  transferBundle,
  treasuryBundle,
  publicBundle,
  autonomousBundle,
} from './bundles.js';
export {
  listRegisteredTools,
  getRegisteredTool,
} from './registry.js';

// Pure runtime helpers the host (and external tool authors) may need:
//   - Solana/transaction helpers: createUmi-free; everything takes umi as an arg
//   - Auth wrapper + policy
//   - Result helpers (ok/info/err) + error taxonomy
//   - AgentContext + StateStore types + Goal/Task/JournalEntry
export * from './internal/index.js';

// Individual tool exports — for advanced consumers building custom toolsets
// outside of createToolset / the bundles.
export * from './tools/index.js';
