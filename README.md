# metaplex-agent-toolkit

Reusable tool catalog + agent runtime for Metaplex Mastra agents. Lets a fresh agent pick which tools to enable without forking the template.

Two packages:

| Package | What it ships |
|---|---|
| **`@metaplex-foundation/agent-runtime`** | Umi factory, env config, `agent-state.json` IO, auth wrapping, Jupiter swap client, registration banner, transaction/funding helpers, error helpers, tool-result helpers, agent-context type. |
| **`@metaplex-foundation/agent-tools`** | Every tool — balances, prices, swaps, registration, treasury, autonomous-mode goals/tasks/pause, user transfers — plus `defineTool`, `createToolset`, and pre-built bundles. |

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

For the default surface, just import a bundle:

```ts
import { publicBundle, autonomousBundle } from '@metaplex-foundation/agent-tools';
new Agent({ tools: publicBundle, /* ... */ });
```

## Tool selection

`createToolset({ include, exclude, capabilities, authPolicy })`:

- **`include`** — list of selectors. Each is a tool id (`'get-balance'`), `'*'` for all, or `'category:<name>'` (e.g. `'category:trade'`). Defaults to every registered tool.
- **`exclude`** — same shape. Subtracted from the included set.
- **`capabilities`** — what the host can deliver. Defaults to every capability. If an included tool requires a capability not in this list, `createToolset` throws at build time naming the missing capability.
- **`authPolicy`** — override the default public/owner policy with your own `(level, ctx) => boolean`.

Returns a `Record<string, Tool>` ready to pass to `new Agent({ tools })`. Keys are camelCased tool ids (`get-balance` → `getBalance`). Every tool has had `withAuth(tool, authLevel, policy)` applied.

### Bundles

Pre-built convenience exports:

| Bundle | Contents |
|---|---|
| `readOnlyBundle` | `category:read` (balances, prices, metadata, tx lookup) |
| `tradingBundle` | `category:trade` (swap, buyback, sell) |
| `registrationBundle` | `category:registration` (register, delegate, launch token) |
| `transferBundle` | `category:transfer` (user-signed SOL/SPL transfers) |
| `treasuryBundle` | `category:treasury` (withdraw, fund) |
| `publicBundle` | Everything except `category:autonomous-only` + `withdraw-sol`. Mirrors the historical `publicAgentTools`. |
| `autonomousBundle` | Everything except `category:transfer`. Mirrors the historical `autonomousAgentTools`. |

### Capabilities

Coarse-grained declarations of what a tool needs from the host:

```
umi-rpc, agent-keypair, agent-identity, agent-token,
jupiter, genesis, registry, state-store, banner
```

A tool declares its needs in `requires: [...]`. The toolset builder checks intent at assembly time — it does not health-check the underlying service.

## Authoring a tool

```ts
import { z } from 'zod';
import { publicKey } from '@metaplex-foundation/umi';
import { createUmi, ok, err, toToolError } from '@metaplex-foundation/agent-runtime';
import { defineTool } from '@metaplex-foundation/agent-tools';

export const getAccountInfo = defineTool({
  id: 'get-account-info',
  authLevel: 'public',
  category: 'read',
  requires: ['umi-rpc'],
  description: 'Get basic account info for a Solana address.',
  inputSchema: z.object({ address: z.string() }),
  outputSchema: z.object({
    status: z.string().optional(),
    code: z.string().optional(),
    exists: z.boolean().optional(),
    lamports: z.string().optional(),
    message: z.string().optional(),
  }),
  execute: async ({ address }) => {
    try {
      const umi = createUmi();
      const acct = await umi.rpc.getAccount(publicKey(address));
      if (!acct.exists) return ok({ exists: false });
      return ok({ exists: true, lamports: acct.lamports.basisPoints.toString() });
    } catch (e) {
      const { code, message } = toToolError(e);
      return err(code, message);
    }
  },
});
```

`defineTool` returns a Mastra-compatible tool with metadata (`authLevel`, `requires`, `category`) attached as non-enumerable properties. It registers itself in the in-memory registry as a side-effect — importing the file is enough to make it discoverable by `createToolset` and the bundles.

## Development

```bash
pnpm install
pnpm build           # build both packages
pnpm test            # run all tests (137 runtime + 117 tools = 254)
pnpm --filter @metaplex-foundation/agent-tools test
pnpm --filter @metaplex-foundation/agent-runtime test
```

## License

See [LICENSE](./LICENSE) (matches the agent-template upstream).
