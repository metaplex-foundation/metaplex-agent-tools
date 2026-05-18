import { defineTool } from '../define-tool.js';
import { z } from 'zod';
import { publicKey } from '@metaplex-foundation/umi';
import {
  createAndRegisterLaunch,
  type BondingCurveLaunchInput,
} from '@metaplex-foundation/genesis';
import {
  err,
  info,
  ok,
  readAgentContext,
  toToolError,
} from '../internal/index.js';

export const launchToken = defineTool({
  id: 'launch-token',
  authLevel: 'owner',
  category: 'registration',
  requires: ['umi-rpc', 'agent-keypair', 'agent-identity', 'genesis', 'state-store', 'banner'],
  description:
    'Launch an agent token on a bonding curve via Metaplex Genesis. WARNING: This is irreversible — each agent can only ever have one token. The agent pays and signs in both public and autonomous modes. Always confirm with the user before calling this tool, and pass `confirmIrreversible: true` to acknowledge the irreversible action.',
  inputSchema: z.object({
    name: z.string().min(1).max(32).describe('Token name (1-32 characters)'),
    symbol: z.string().min(1).max(10).describe('Token symbol (1-10 characters)'),
    imageUri: z.string().url().describe('Token image URL (must be an Irys URL)'),
    description: z
      .string()
      .max(250)
      .optional()
      .describe('Token description (max 250 characters)'),
    firstBuyAmount: z
      .number()
      .positive()
      .optional()
      .describe('SOL amount for an initial fee-free token purchase'),
    confirmIrreversible: z
      .literal(true)
      .describe(
        'Must be set to `true` to confirm the caller understands that launching a token is irreversible and each agent can only ever have one token. Never pass `true` without explicit user confirmation.',
      ),
  }),
  outputSchema: z.object({
    status: z.string().optional(),
    code: z.string().optional(),
    mintAddress: z.string().optional(),
    launchLink: z.string().optional(),
    message: z.string().optional(),
  }),
  execute: async (
    { name, symbol, imageUri, description, firstBuyAmount, confirmIrreversible },
    { requestContext }
  ) => {
    // Belt-and-braces: Zod enforces `literal(true)` at parse time, but if a
    // client somehow bypassed that we still refuse to proceed.
    if (confirmIrreversible !== true) {
      return err(
        'INVALID_INPUT',
        'launch-token requires explicit user confirmation via `confirmIrreversible: true`. Refusing to launch.',
      );
    }

    const ctx = readAgentContext(requestContext);

    if (!ctx.agentAssetAddress) {
      return err(
        'NOT_REGISTERED',
        'Agent must be registered first. Use register-agent and delegate-execution before launching a token.',
      );
    }

    if (ctx.agentTokenMint) {
      return info({
        mintAddress: ctx.agentTokenMint,
        message: `Agent already has a token: ${ctx.agentTokenMint}. Each agent can only have one token.`,
      });
    }

    if (ctx.tokenOverride) {
      return info({
        mintAddress: ctx.tokenOverride,
        message: `Token override is set to ${ctx.tokenOverride}. This agent is configured to buy back an existing token instead of launching its own.`,
      });
    }

    try {
      const launchConfig: BondingCurveLaunchInput = {};
      if (firstBuyAmount !== undefined) {
        launchConfig.firstBuyAmount = firstBuyAmount;
      }

      const result = await createAndRegisterLaunch(
        ctx.umi,
        {},
        {
          wallet: ctx.umi.identity.publicKey,
          agent: {
            mint: publicKey(ctx.agentAssetAddress),
            setToken: true,
          },
          launchType: 'bondingCurve',
          network: ctx.network,
          token: {
            name,
            symbol,
            image: imageUri,
            ...(description ? { description } : {}),
          },
          launch: launchConfig,
        }
      );

      // Host-implemented side effects: persist the mint, print the banner,
      // update in-memory config. Isolated in its own try so a banner
      // failure cannot bubble into the outer catch and report a successful
      // (irreversible) mint as a launch failure.
      try {
        ctx.onTokenLaunched?.(result.mintAddress);
      } catch (cbErr) {
        console.error(
          '[launch-token] onTokenLaunched callback failed (mint succeeded):',
          cbErr instanceof Error ? cbErr.message : String(cbErr),
        );
      }

      return ok({
        mintAddress: result.mintAddress,
        launchLink: result.launch.link,
        message: `Token launched! Mint: ${result.mintAddress}. This has been saved automatically. Creator fees will flow to your agent PDA automatically.`,
      });
    } catch (error) {
      console.error('[launch-token]', error);
      const { code, message } = toToolError(error);
      return err(code, `Token launch failed: ${message}`);
    }
  },
});
