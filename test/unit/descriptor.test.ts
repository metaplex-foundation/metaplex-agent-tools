import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { z } from 'zod';
import {
  defineToolDescriptor,
  getBalance,
  swapToken,
  registerAgent,
  type ToolDefinition,
} from '../../src/index.js';

/**
 * For each of the three representative tools, the `ToolDefinition` produced
 * by `defineTool` should carry a structurally-equivalent descriptor — same
 * id, description, authLevel, requires, category. The descriptor's
 * `inputSchema` is the very object the author passed in, so reference
 * equality is sufficient.
 */
function descriptorFor(def: ToolDefinition) {
  return def.descriptor;
}

function expectedSchemaFromDefinition(def: ToolDefinition) {
  return def.inputSchema;
}

test('defineTool exposes a descriptor with id/description/authLevel/requires/category', () => {
  const samples = [getBalance, swapToken, registerAgent];
  for (const tool of samples) {
    const d = descriptorFor(tool);
    assert.equal(d.id, tool.id);
    assert.equal(d.description, tool.description);
    assert.equal(d.authLevel, tool.authLevel);
    assert.equal(d.category, tool.category);
    assert.deepEqual(d.requires ?? [], tool.requires);
    // Schema is a Zod object on both sides — Mastra re-wraps the user's
    // schema internally, so reference equality only holds on the descriptor
    // (which carries the original). Sanity-check it's a Zod schema.
    assert.ok(d.inputSchema && typeof (d.inputSchema as any).parse === 'function');
    assert.ok(expectedSchemaFromDefinition(tool));
    assert.equal(typeof d.execute, 'function');
  }
});

test('defineToolDescriptor returns the same descriptor (identity helper)', () => {
  const args = {
    id: 'test-tool',
    description: 'A test descriptor',
    inputSchema: z.object({ x: z.number() }),
    authLevel: 'public',
    requires: ['umi-rpc'] as const,
    category: 'read' as const,
    execute: async (input: { x: number }) => ({ y: input.x + 1 }),
  };
  const d = defineToolDescriptor(args);
  assert.equal(d.id, args.id);
  assert.equal(d.description, args.description);
  assert.equal(d.authLevel, args.authLevel);
  assert.equal(d.category, args.category);
  assert.equal(d.inputSchema, args.inputSchema);
  assert.equal(d.execute, args.execute);
});

test('a hand-built descriptor for get-balance is structurally equivalent to the defineTool output', () => {
  // Build the equivalent descriptor directly — no Mastra wrap, just the
  // pure metadata. This mirrors what an external author writing tools
  // outside the package would produce.
  const equivalent = defineToolDescriptor({
    id: 'get-balance',
    description: getBalance.description as string,
    authLevel: 'public',
    requires: ['umi-rpc'],
    category: 'read',
    inputSchema: getBalance.inputSchema as z.ZodType<unknown>,
    execute: async () => ({}),
  });

  const fromDefineTool = descriptorFor(getBalance);
  assert.equal(equivalent.id, fromDefineTool.id);
  assert.equal(equivalent.description, fromDefineTool.description);
  assert.equal(equivalent.authLevel, fromDefineTool.authLevel);
  assert.equal(equivalent.category, fromDefineTool.category);
  assert.deepEqual(equivalent.requires, fromDefineTool.requires);
});
