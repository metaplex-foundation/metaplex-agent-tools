// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthContext {
  connectedWallet: string | null;
  ownerWallet: string | null;
}

/**
 * An authorization policy evaluates whether a tool with a given auth level
 * is allowed to execute in the current context. Hosts can replace or
 * extend the default policy to add custom auth levels.
 */
export type AuthPolicy = (authLevel: string, context: AuthContext) => boolean;

// ---------------------------------------------------------------------------
// Default Policy
// ---------------------------------------------------------------------------

/**
 * Ships with two levels:
 *  - `public`  — any connected client can trigger the tool
 *  - `owner`   — only the verified asset owner can trigger the tool
 *
 * Unknown levels are denied by default (fail-closed).
 */
export const defaultAuthPolicy: AuthPolicy = (level, ctx) => {
  if (level === 'public') return true;
  if (level === 'owner') {
    return ctx.ownerWallet !== null && ctx.connectedWallet === ctx.ownerWallet;
  }
  return false;
};

// ---------------------------------------------------------------------------
// Tool Auth Wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps a tool's `execute` function with an authorization check.
 * If the policy denies the call, the tool throws an error that Mastra
 * surfaces to the LLM as a failed tool result — the LLM never executes
 * the underlying logic.
 *
 * Mutates the tool in place and returns it (rather than shallow-spreading)
 * so Mastra-attached non-enumerable metadata is preserved.
 */
export function withAuth<T extends { execute?: (...args: any[]) => any }>(
  tool: T,
  authLevel: string,
  policy: AuthPolicy = defaultAuthPolicy,
): T {
  const originalExecute = tool.execute;
  if (!originalExecute) return tool;

  const wrappedExecute = async (args: any, ctx: any) => {
    const requestContext = ctx?.requestContext;
    const connectedWallet: string | null = requestContext?.get?.('walletAddress') ?? null;
    const ownerWallet: string | null = requestContext?.get?.('ownerWallet') ?? null;

    if (!policy(authLevel, { connectedWallet, ownerWallet })) {
      throw new Error(
        'This operation requires owner authorization. ' +
        `Connected wallet: ${connectedWallet ?? 'none'}. ` +
        'Please connect the owner wallet to use this tool.',
      );
    }

    return originalExecute(args, ctx);
  };

  tool.execute = wrappedExecute as T['execute'];
  return tool;
}
