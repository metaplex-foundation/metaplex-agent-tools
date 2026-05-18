import { defineTool } from '../define-tool.js';
import { z } from 'zod';
import { publicKey } from '@metaplex-foundation/umi';
import {
  fetchAllTokenByOwner,
  fetchMint,
} from '@metaplex-foundation/mpl-toolbox';
import { BASE58_ADDRESS_RE, err, ok, readAgentContext, toToolError } from '../internal/index.js';

export const getTokenBalances = defineTool({
  id: 'get-token-balances',
  authLevel: 'public',
  category: 'read',
  requires: ['umi-rpc'],
  description:
    'Get all SPL token holdings for a Solana wallet. Returns mint addresses, raw amounts, and human-readable amounts with decimals.',
  inputSchema: z.object({
    address: z
      .string()
      .regex(BASE58_ADDRESS_RE, 'address must be a valid base58 Solana address')
      .describe('The Solana wallet address (base58-encoded public key)'),
  }),
  outputSchema: z.object({
    status: z.string().optional(),
    code: z.string().optional(),
    address: z.string().optional(),
    tokens: z
      .array(
        z.object({
          mint: z.string(),
          rawAmount: z.string(),
          decimals: z.number(),
          uiAmount: z.number(),
        })
      )
      .optional(),
    message: z.string().optional(),
  }),
  execute: async ({ address }, { requestContext }) => {
    try {
      const { umi } = readAgentContext(requestContext);
      const owner = publicKey(address);
      const tokenAccounts = await fetchAllTokenByOwner(umi, owner);

      const tokens = await Promise.all(
        tokenAccounts
          .filter((ta) => ta.amount > 0n)
          .map(async (ta) => {
            const mintAccount = await fetchMint(umi, ta.mint);
            const uiAmount =
              Number(ta.amount) / Math.pow(10, mintAccount.decimals);
            return {
              mint: ta.mint.toString(),
              rawAmount: ta.amount.toString(),
              decimals: mintAccount.decimals,
              uiAmount,
            };
          })
      );

      return ok({ address, tokens });
    } catch (error) {
      console.error('[get-token-balances]', error);
      const { code, message } = toToolError(error);
      return err(code, `Failed to get token balances for ${address}: ${message}`);
    }
  },
});
