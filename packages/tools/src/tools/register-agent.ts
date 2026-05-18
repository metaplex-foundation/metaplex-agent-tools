import { defineTool } from '../define-tool.js';
import { z } from 'zod';
import { mintAndSubmitAgent } from '@metaplex-foundation/mpl-agent-registry';
import {
  err,
  info,
  ok,
  readAgentContext,
  toToolError,
  type ToolResult,
} from '@metaplex-foundation/agent-runtime';
import { base58 } from '@metaplex-foundation/umi/serializers';

/**
 * Module-scoped single-flight guard. If a registration is already in
 * progress, concurrent callers await the same promise and observe the same
 * result instead of each starting an independent funding+mint flow.
 */
let inflightRegistration: Promise<ToolResult<Record<string, unknown>>> | null = null;

export const registerAgent = defineTool({
  id: 'register-agent',
  authLevel: 'owner',
  category: 'registration',
  requires: ['umi-rpc', 'agent-keypair', 'registry', 'banner'],
  description:
    'Register this agent on the Metaplex Agent Registry. Creates an MPL Core asset and Agent Identity PDA. Only needs to be called once — check if AGENT_ASSET_ADDRESS is already set before calling.',
  inputSchema: z.object({
    name: z.string().min(1).describe('Display name for the agent'),
    description: z.string().min(1).describe('Description of the agent capabilities'),
    metadataUri: z
      .string()
      .url()
      .optional()
      .describe('Publicly hosted JSON metadata URI. If not provided, a placeholder will be used.'),
  }),
  outputSchema: z.object({
    status: z.string().optional(),
    code: z.string().optional(),
    assetAddress: z.string().optional(),
    signature: z.string().optional(),
    message: z.string().optional(),
    fundingRequested: z.boolean().optional(),
  }),
  execute: async ({ name, description, metadataUri }, { requestContext }) => {
    const ctx = readAgentContext(requestContext);
    if (ctx.agentAssetAddress) {
      return info({
        assetAddress: ctx.agentAssetAddress,
        message: `Agent is already registered with asset address: ${ctx.agentAssetAddress}`,
      });
    }

    if (inflightRegistration) {
      return inflightRegistration;
    }

    const run = async (): Promise<ToolResult<Record<string, unknown>>> => {
      // Run ensureFunded outside the outer try so we can return its error
      // verbatim with an INSUFFICIENT_FUNDS code, instead of letting it get
      // re-mapped by toToolError into a generic message.
      if (ctx.ensureFunded) {
        try {
          await ctx.ensureFunded();
        } catch (e) {
          return err(
            'INSUFFICIENT_FUNDS',
            e instanceof Error ? e.message : String(e),
          );
        }
      }

      try {
        const result = await mintAndSubmitAgent(ctx.umi, {}, {
          wallet: ctx.umi.identity.publicKey,
          name,
          uri: metadataUri ?? 'https://example.com/agent-metadata.json',
          network: ctx.network,
          agentMetadata: {
            type: 'agent',
            name,
            description,
            services: [],
            registrations: [],
            supportedTrust: [],
          },
        });

        const signatureStr = base58.deserialize(result.signature)[0];

        // Host-implemented side effects: persist the asset address, clear
        // owner cache, print the registration banner. We pass the address
        // — the host knows where to write it (file, env, etc.).
        ctx.onAssetRegistered?.(result.assetAddress);

        return ok({
          assetAddress: result.assetAddress,
          signature: signatureStr,
          message: `Agent registered successfully! Asset address: ${result.assetAddress}. This has been saved automatically.`,
        });
      } catch (error) {
        console.error('[register-agent]', error);
        const { code, message } = toToolError(error);
        return err(code, `Registration failed: ${message}`);
      }
    };

    inflightRegistration = run();
    try {
      return await inflightRegistration;
    } finally {
      inflightRegistration = null;
    }
  },
});
