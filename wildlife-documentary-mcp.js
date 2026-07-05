#!/usr/bin/env node
/**
 * Wildlife Documentary MCP Server
 *
 * Dedicated MCP entrypoint for Cinematic Viral Wildlife Explainers.
 * This leaves the older generic faceless generator intact while giving the new
 * niche-first workflow a locked tool and locked prompt system.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { robustParseJSON } from './validation.js';
import {
  DEFAULT_WILDLIFE_VISUAL_STYLE,
  EPISODE_TYPES,
  buildWildlifeSystemPrompt,
  buildWildlifeUserMessage,
  enforceWildlifePackage,
  validateWildlifePackage,
  scoreWildlifePackage,
} from './wildlife-documentary-engine.js';

const API_KEY = process.env.ANTHROPIC_API_KEY || null;
const FALLBACK_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const ROUTER_URL = (process.env.FCT_ROUTER_URL || '').replace(/\/+$/, '');
const FORCE_DIRECT_PROVIDER = /^true|1|yes$/i.test(process.env.FCT_FORCE_DIRECT_PROVIDER || '');

const providerEnum = [
  'auto',
  'anthropic',
  'openai',
  'opencode_zen',
  'opencode_go',
  'nine_router',
  'neuralwatt',
  'codex_oauth',
  'custom_openai_compatible',
];

const episodeEnum = Object.keys(EPISODE_TYPES);

function parsePackage(rawText) {
  return enforceWildlifePackage(robustParseJSON(rawText));
}

async function callViaSampling(mcpServer, args, systemPrompt) {
  const result = await mcpServer.server.createMessage({
    messages: [
      {
        role: 'user',
        content: { type: 'text', text: buildWildlifeUserMessage(args) },
      },
    ],
    systemPrompt,
    maxTokens: 5000,
  });

  const text = result?.content?.type === 'text' ? result.content.text : '';
  if (!text) throw new Error('Sampling returned no text content.');
  return parsePackage(text);
}

async function callViaProviderRouter(args, systemPrompt) {
  if (!ROUTER_URL) throw new Error('FCT_ROUTER_URL is not set.');

  const response = await fetch(`${ROUTER_URL}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: args.provider || 'auto',
      max_tokens: 5000,
      system: systemPrompt,
      messages: [{ role: 'user', content: buildWildlifeUserMessage(args) }],
      imageTool: args.image_tool || 'generic',
      videoTool: args.video_tool || 'generic',
      length: args.length || '30-40 seconds',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Provider router error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const raw = (data.content || []).map((block) => block.text || '').join('\n');
  return parsePackage(raw);
}

async function callDirectAnthropic(args, systemPrompt) {
  if (!API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: FALLBACK_MODEL,
      max_tokens: 5000,
      system: systemPrompt,
      messages: [{ role: 'user', content: buildWildlifeUserMessage(args) }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const raw = (data.content || []).map((block) => block.text || '').join('\n');
  return parsePackage(raw);
}

async function generatePackage(server, args) {
  const systemPrompt = buildWildlifeSystemPrompt({
    visualStyle: args.visual_style || DEFAULT_WILDLIFE_VISUAL_STYLE,
    imageTool: args.image_tool || 'generic',
    videoTool: args.video_tool || 'generic',
  });

  const maxAttempts = 2;
  let attempt = 0;
  let lastError = '';
  let pkg = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    const retryPrompt = attempt === 1
      ? systemPrompt
      : `${systemPrompt}\n\nYour previous output failed QA:\n${lastError}\nFix only those issues and return ONLY valid JSON.`;

    try {
      if (FORCE_DIRECT_PROVIDER) throw new Error('Direct provider forced by FCT_FORCE_DIRECT_PROVIDER.');
      pkg = await callViaSampling(server, args, retryPrompt);
    } catch (samplingError) {
      try {
        if (ROUTER_URL) pkg = await callViaProviderRouter(args, retryPrompt);
        else if (API_KEY) pkg = await callDirectAnthropic(args, retryPrompt);
        else throw new Error(
          `Sampling is not supported and no fallback provider is configured. ` +
          `Set FCT_ROUTER_URL=http://127.0.0.1:3737 or ANTHROPIC_API_KEY. ` +
          `(Sampling error: ${samplingError.message})`
        );
      } catch (providerError) {
        lastError = `- Generation failed: ${providerError.message}`;
        continue;
      }
    }

    pkg = enforceWildlifePackage(pkg);
    const errors = validateWildlifePackage(pkg, args.length || '30-40 seconds');
    if (errors.length) {
      lastError = errors.map((error) => `- ${error}`).join('\n');
      continue;
    }

    const wildlifeQa = scoreWildlifePackage(pkg, args.length || '30-40 seconds');
    pkg.qa = { wildlife: wildlifeQa };

    if (wildlifeQa.overall >= 75 || attempt === maxAttempts) return pkg;
    lastError = wildlifeQa.flags.map((flag) => `- ${flag}`).join('\n') || '- Wildlife QA score below target.';
  }

  throw new Error(`Could not generate a valid wildlife package after ${maxAttempts} attempt(s). Last issue(s):\n${lastError}`);
}

const server = new McpServer({
  name: 'wildlife-documentary-generator',
  version: '1.0.0',
});

server.tool(
  'generate_wildlife_documentary_content',
  'Generates a Living-Earth-style cinematic viral wildlife explainer package: hook, adaptation chain, script, storyboard, image prompts, video prompts, captions, and wildlife-specific QA.',
  {
    animal: z
      .string()
      .optional()
      .describe('Specific animal, animal group, or behavior. Leave blank to let the engine pick a strong viral wildlife topic.'),
    episode_type: z
      .enum(episodeEnum)
      .default('auto')
      .describe('Locked wildlife episode structure.'),
    length: z
      .enum(['15-20 seconds', '30-40 seconds', '45-60 seconds', '60-90 seconds'])
      .default('30-40 seconds')
      .describe('Target short-form video length.'),
    visual_style: z
      .string()
      .default(DEFAULT_WILDLIFE_VISUAL_STYLE)
      .describe('Visual style to bake into every wildlife image/video prompt.'),
    extra: z
      .string()
      .optional()
      .describe('Specific fact, behavior, constraint, caption preference, or production note to include.'),
    provider: z
      .enum(providerEnum)
      .default('auto')
      .describe('Optional provider preset when using the secure local router.'),
    image_tool: z
      .string()
      .default('generic')
      .describe('Target image generator: generic, midjourney, dalle, sd, seedream.'),
    video_tool: z
      .string()
      .default('generic')
      .describe('Target video generator: generic, sora, runway, kling, ltx, luma.'),
  },
  async (args) => {
    try {
      const pkg = await generatePackage(server, args);
      return { content: [{ type: 'text', text: JSON.stringify(pkg, null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: error.message || String(error) }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  `[wildlife-documentary-mcp] Server running on stdio. ` +
  (ROUTER_URL ? `Router fallback: ${ROUTER_URL}.` : API_KEY ? `Anthropic fallback: ${FALLBACK_MODEL}.` : 'No fallback configured.')
);
