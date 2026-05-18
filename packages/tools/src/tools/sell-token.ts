import { defineTool } from '../define-tool.js';
import { z } from 'zod';
import {
  err,
  executeSwap,
  ok,
  readAgentContext,
  SOL_MINT,
  toToolError,
} from '../internal/index.js';

export const sellToken = defineTool({
  id: 'sell-token',
  authLevel: 'owner',
  category: 'trade',
  requires: ['umi-rpc', 'agent-keypair', 'agent-token', 'jupiter'],
  description:
    "Sell the agent's own token for SOL. Use this to fund operations or realize value. Be transparent about why you're selling.",
  inputSchema: z.object({
    tokenAmount: z
      .string()
      .regex(/^\d+(\.\d+)?$/, 'tokenAmount must be a positive decimal number string')
      .refine((s) => Number(s) > 0, 'tokenAmount must be positive')
      .describe('Amount of agent tokens to sell (in smallest unit / base units)'),
    slippageBps: z
      .number()
      .int()
      .min(1)
      .max(10000)
      .optional()
      .describe('Slippage tolerance in basis points (default 50 = 0.5%)'),
  }),
  outputSchema: z.object({
    status: z.string().optional(),
    code: z.string().optional(),
    signature: z.string().optional(),
    tokensSold: z.string().optional(),
    solReceived: z.string().optional(),
    priceImpact: z.string().optional(),
    message: z.string().optional(),
  }),
  execute: async ({ tokenAmount, slippageBps }, { requestContext }) => {
    const ctx = readAgentContext(requestContext);
    const agentTokenMint = ctx.tokenOverride ?? ctx.agentTokenMint;

    if (!ctx.agentAssetAddress) {
      return err('NOT_REGISTERED', 'Agent must be registered first. No agent asset address found.');
    }

    if (!agentTokenMint) {
      return err(
        'NO_TOKEN',
        'No token configured. Launch a token with launch-token, or configure a token override.',
      );
    }

    if (slippageBps !== undefined && slippageBps > ctx.maxSlippageBps) {
      return err(
        'SLIPPAGE_TOO_HIGH',
        `Slippage ${slippageBps} bps exceeds configured max of ${ctx.maxSlippageBps} bps`,
      );
    }

    try {
      const result = await executeSwap(
        ctx.umi,
        {
          walletAddress: ctx.umi.identity.publicKey.toString(),
          inputMint: agentTokenMint,
          outputMint: SOL_MINT,
          amount: tokenAmount,
          slippageBps,
        },
        { apiKey: ctx.jupiterApiKey, maxPriceImpactPct: ctx.maxPriceImpactPct },
      );

      return ok({
        signature: result.signature,
        tokensSold: result.inputAmount,
        solReceived: result.outputAmount,
        priceImpact: result.priceImpact,
        message: `Sell complete. Sold ${result.inputAmount} tokens, received ${result.outputAmount} lamports SOL. Price impact: ${result.priceImpact}%.`,
      });
    } catch (error) {
      console.error('[sell-token]', error);
      if (error instanceof Error && error.message.startsWith('INTEGRITY:')) {
        return err('INTEGRITY', `Sell refused: ${error.message.slice('INTEGRITY:'.length).trim()}`);
      }
      const { code, message } = toToolError(error);
      return err(code, `Sell failed: ${message}`);
    }
  },
});
