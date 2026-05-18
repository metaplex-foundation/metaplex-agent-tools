// Importing this side-effect module evaluates every tool file, which
// runs each `defineTool(...)` and populates the registry. Without it,
// the bundles below would build at module-load time against an empty
// registry and return `{}`.
import './tools/index.js';
import { createToolset } from './toolset.js';

/** Read-only RPC tools — balances, prices, metadata, tx lookup. */
export const readOnlyBundle = createToolset({ include: ['category:read'] });

/** Jupiter trading — swap, buyback, sell. Requires `jupiter` + `agent-keypair`. */
export const tradingBundle = createToolset({ include: ['category:trade'] });

/** On-chain identity bootstrap — register, delegate, launch token. */
export const registrationBundle = createToolset({
  include: ['category:registration'],
});

/** User-signed SOL/SPL transfers (public-mode friendly). */
export const transferBundle = createToolset({ include: ['category:transfer'] });

/** Treasury movements (withdraw / fund). */
export const treasuryBundle = createToolset({ include: ['category:treasury'] });

/**
 * Convenience replica of the template's historical `publicAgentTools` —
 * every shared + transfer tool, no autonomous-only working-memory tools,
 * no `withdraw-sol`.
 */
export const publicBundle = createToolset({
  exclude: ['category:autonomous-only', 'withdraw-sol'],
});

/**
 * Convenience replica of the template's historical `autonomousAgentTools` —
 * every shared + autonomous-only tool, no user-facing transfers.
 */
export const autonomousBundle = createToolset({
  exclude: ['category:transfer'],
});
