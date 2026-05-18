# metaplex-agent-toolkit

Reusable tool catalog + agent runtime for Metaplex Mastra agents.

Two packages:

- **`@metaplex-foundation/agent-runtime`** — process-level singletons every
  Metaplex agent needs: Umi factory, env config, `agent-state.json` IO,
  auth wrapping, Jupiter swap client, registration banner, error helpers,
  agent-context types.
- **`@metaplex-foundation/agent-tools`** — Mastra tools (balances, swaps,
  registration, autonomous-mode goals/tasks/pause, treasury, transfers),
  authored with `defineTool`, selectable via `createToolset({ include, exclude, capabilities })`
  or via pre-built bundles (`publicBundle`, `autonomousBundle`, etc.).

See `docs/` and the `014-agent-template` repo for a full consumer example.

## Quick start

```ts
import { Agent } from '@mastra/core/agent';
import { getConfig } from '@metaplex-foundation/agent-runtime';
import { createToolset } from '@metaplex-foundation/agent-tools';

const config = getConfig();
const tools = createToolset({
  include: ['get-balance', 'swap-token', 'category:read'],
  exclude: ['withdraw-sol'],
  capabilities: ['umi-rpc', 'agent-keypair', 'jupiter'],
});

new Agent({
  id: 'my-agent',
  name: 'My Agent',
  model: config.LLM_MODEL,
  instructions: 'You are a Solana agent.',
  tools,
});
```
