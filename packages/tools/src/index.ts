// Side-effect import: evaluating each tool file registers its definition
// in the in-memory registry. Consumers that only call `createToolset`
// or import bundles rely on this happening before their call.
import './tools/index.js';

export { defineTool, type ToolDefinition, type DefineToolArgs } from './define-tool.js';
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

// Re-export every individual tool — for advanced consumers building
// custom toolsets without going through the bundles.
export * from './tools/index.js';
