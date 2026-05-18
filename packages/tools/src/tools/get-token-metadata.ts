import { defineTool } from '../define-tool.js';
import { z } from 'zod';
import { BASE58_ADDRESS_RE, err, ok, readAgentContext, toToolError } from '@metaplex-foundation/agent-runtime';

export const getTokenMetadata = defineTool({
  id: 'get-token-metadata',
  authLevel: 'public',
  category: 'read',
  requires: ['umi-rpc'],
  description:
    'Get metadata (name, symbol, image) for a Solana token by its mint address. Uses the DAS API. Returns null fields if metadata is unavailable.',
  inputSchema: z.object({
    mintAddress: z
      .string()
      .regex(BASE58_ADDRESS_RE, 'mintAddress must be a valid base58 Solana address')
      .describe('The token mint address (base58-encoded)'),
  }),
  outputSchema: z.object({
    status: z.string().optional(),
    code: z.string().optional(),
    mint: z.string().optional(),
    name: z.string().nullable().optional(),
    symbol: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
    message: z.string().optional(),
  }),
  execute: async ({ mintAddress }, { requestContext }) => {
    const { umi } = readAgentContext(requestContext);

    try {
      const asset = await umi.rpc.call<{
        content: {
          metadata: { name?: string; symbol?: string };
          links?: { image?: string };
        };
      }>('getAsset', [mintAddress]);

      return ok({
        mint: mintAddress,
        name: asset.content.metadata.name ?? null,
        symbol: asset.content.metadata.symbol ?? null,
        image: asset.content.links?.image ?? null,
      });
    } catch (error) {
      console.error('[get-token-metadata]', error);
      const { code, message } = toToolError(error);
      return err(code, `Failed to fetch token metadata for ${mintAddress}: ${message}`);
    }
  },
});
