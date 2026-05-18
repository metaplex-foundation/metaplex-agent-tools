import { defineTool } from '../define-tool.js';
import { z } from 'zod';
import { err, ok, readAgentContext } from '../internal/index.js';

/**
 * Toggle the worker-loop pause flag. When paused=true, the worker skips
 * the tick body entirely (no LLM cost, no tx). The owner uses this to
 * stop the agent if it's misbehaving or while taking the wallet offline
 * for maintenance. Unpause is symmetric.
 *
 * Idempotent: pausing an already-paused agent is a no-op (no journal noise).
 */
export const setPausedTool = defineTool({
  id: 'set-paused',
  authLevel: 'owner',
  category: 'autonomous-only',
  requires: ['state-store'],
  description:
    'Pause or unpause the autonomous worker loop. Paused=true skips all future ticks until unpaused. Owner-facing emergency switch.',
  inputSchema: z.object({
    paused: z.boolean().describe('True to pause, false to resume.'),
    reason: z
      .string()
      .max(300)
      .optional()
      .describe('Short note on why — appended to the journal.'),
  }),
  outputSchema: z.object({
    status: z.string().optional(),
    code: z.string().optional(),
    paused: z.boolean().optional(),
    message: z.string().optional(),
  }),
  execute: async ({ paused, reason }, { requestContext }) => {
    const { state } = readAgentContext(requestContext);
    if (!state) {
      return err(
        'INVALID_INPUT',
        'No state store available. set-paused requires the host to provide a StateStore in the agent context.',
      );
    }
    state.setPaused(paused, reason);
    return ok({
      paused,
      message: paused ? 'Worker loop paused.' : 'Worker loop resumed.',
    });
  },
});
