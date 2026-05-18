# metaplex-agent-tools

Reusable Mastra tool catalog for Metaplex Solana agents. Lets a fresh agent pick which tools to enable without forking a template — install `@metaplex-foundation/agent-tools`, hand it a bundle (or `createToolset({ include, exclude, capabilities })`), and the full Metaplex tool set drops into a `new Agent({ tools })` call.

Ships every tool — balances, prices, swaps, registration, treasury, autonomous-mode goals/tasks/pause, user transfers — plus the pure helpers tools call (`withAuth`, `submitOrSend`, `executeSwap`, `readAgentContext`, `ok`/`info`/`err`, `AgentContext` + `StateStore` types, …).

**Tools are pure.** They never call `getConfig()`, `getState()`, or `createUmi()`. Everything a tool needs — `umi`, network, env-driven knobs, state store, side-effect callbacks — arrives via the Mastra `RequestContext`. The host wires that context up once per chat turn / worker tick. See [`014-agent-template`](https://github.com/metaplex-foundation/metaplex-mastra-agent-template) for a working host implementation (`buildToolHostContext`).

## Quick start

```ts
import { Agent } from '@mastra/core/agent';
import { createToolset } from '@metaplex-foundation/agent-tools';

const tools = createToolset({
  include: ['get-balance', 'swap-token', 'category:read'],
  exclude: ['withdraw-sol'],
  capabilities: ['umi-rpc', 'agent-keypair', 'jupiter'],
});

new Agent({
  id: 'my-agent',
  name: 'My Agent',
  model: 'anthropic/claude-sonnet-4-5-20250929',
  instructions: 'You are a Solana agent.',
  tools,
});
```

At call-time, build a `RequestContext` carrying every `AgentContext` field and pass it to `agent.generate({ requestContext })`. The reference template ships a `buildToolHostContext({...})` helper that does this from `getConfig()` + `agent-state.json` (file-backed state). A custom host can supply any `StateStore` implementation (Redis, Postgres, …) and any callbacks for `onAssetRegistered`, `onTokenLaunched`, `ensureFunded`.

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
| `publicBundle` | Everything except `category:autonomous-only` + `withdraw-sol`. The historical multi-user/chat surface. |
| `autonomousBundle` | Everything except `category:transfer`. The historical autonomous-mode surface. |

### Capabilities

Coarse-grained declarations of what a tool needs from the host:

```
umi-rpc, agent-keypair, agent-identity, agent-token,
jupiter, genesis, registry, state-store, banner
```

A tool declares its needs in `requires: [...]`. The builder checks intent at assembly time — it does not health-check the underlying service.

## Authoring a tool

```ts
import { z } from 'zod';
import { publicKey } from '@metaplex-foundation/umi';
import {
  defineTool,
  readAgentContext,
  ok,
  err,
  toToolError,
} from '@metaplex-foundation/agent-tools';

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
  execute: async ({ address }, { requestContext }) => {
    try {
      const { umi } = readAgentContext(requestContext);
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

Notice: **the tool never calls `createUmi()` or `getConfig()`**. Everything it needs comes from `requestContext` via `readAgentContext`. That keeps tools framework-agnostic and trivially testable — pass any object with `.get(key)` and assert against the return.

`defineTool` returns a Mastra-compatible tool with metadata (`authLevel`, `requires`, `category`) attached as non-enumerable properties. It registers itself in the in-memory registry as a side-effect — importing the file is enough to make it discoverable by `createToolset` and the bundles.

## Repo layout

Flat, single-package — `src/`, `test/`, one `package.json`.

```text
metaplex-agent-tools/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts            # public API
│   ├── define-tool.ts      # defineTool() helper
│   ├── capabilities.ts     # Capability + ToolCategory enums
│   ├── registry.ts         # in-memory tool registry
│   ├── toolset.ts          # createToolset() builder
│   ├── bundles.ts          # pre-built bundles
│   ├── internal/           # pure helpers tools call
│   │   ├── auth.ts         #   withAuth, AuthPolicy
│   │   ├── context.ts      #   readAgentContext
│   │   ├── transaction.ts  #   submitOrSend, submitAsAgent, submitWithUserWallet
│   │   ├── jupiter.ts      #   executeSwap, getSwapQuote, simulateAndVerifySwap
│   │   ├── execute.ts      #   getAgentPda (mpl-core helper)
│   │   ├── error-codes.ts  #   ToolErrorCode, toToolError
│   │   ├── constants.ts    #   BASE58 regexes
│   │   └── types/
│   │       ├── agent.ts    #   AgentContext, StateStore, Goal, Task, JournalEntry
│   │       └── tool-result.ts # ok/info/err + ToolResult types
│   └── tools/              # 21 tools across 18 files
└── test/
    ├── unit/
    ├── integration/
    └── helpers/
```

## Development

```bash
pnpm install
pnpm build
pnpm test     # 118 tests
```

## License

See [LICENSE](./LICENSE) (matches the agent-template upstream).
