#!/usr/bin/env node
/**
 * Faceless Content MCP Server
 * Exposes a "generate_faceless_content" tool that produces a script,
 * storyboard, and image/video generation prompts for short-form
 * (YouTube Shorts / TikTok / Reels) content, for any niche.
 *
 * Works with any MCP-compatible client (Hermes Agent, Claude Desktop,
 * omp, Cursor, etc.) over stdio.
 *
 * Model behavior (sampling-first):
 *   By default this server does NOT call the Anthropic API itself. It
 *   asks the connected agent to run the generation via MCP sampling
 *   (`sampling/createMessage`), so it always uses whatever model your
 *   agent is currently set to — including if you switch models later.
 *   No API key is needed for this path.
 *
 *   If the connected client doesn't support sampling, the server falls
 *   back to calling api.anthropic.com directly using ANTHROPIC_API_KEY
 *   (and ANTHROPIC_MODEL, default "claude-sonnet-5"). This fallback only
 *   activates when sampling isn't available — set the env var to enable it.
 *
 * Setup:
 *   npm install
 *   node index.js
 *
 * Then point your MCP client at this file (see README.md / setup-guide.html).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { robustParseJSON, validateVideoPackage, scoreVideoPackage, enforceVisualConsistency } from "./validation.js";

const API_KEY = process.env.ANTHROPIC_API_KEY || null;
const FALLBACK_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const ROUTER_URL = (process.env.FCT_ROUTER_URL || "").replace(/\/+$/, "");
const FORCE_DIRECT_PROVIDER = /^true|1|yes$/i.test(process.env.FCT_FORCE_DIRECT_PROVIDER || "");

const SYSTEM_PROMPT = (visualStyle) => `You are an elite short-form video strategist. You've studied thousands of top-performing YouTube Shorts/TikTok/Reels and know exactly what separates a video that gets 50 views from one that gets 5 million. You write scripts, storyboards, and AI image/video generation prompts for faceless content, for ANY niche.

Respond with ONLY valid JSON, no markdown fences, no preamble, matching exactly this schema:
{
  "title": "short punchy working title",
  "hook": "the first line/hook, designed to stop the scroll in under 2 seconds",
  "visual_bible": { "subject": "the one consistent on-screen subject/object/character across the whole video, or 'none - abstract/object b-roll' if there isn't one", "setting": "the one consistent environment/location style used all the way through", "palette": "3-4 locked color descriptors reused in every scene (e.g. 'warm amber, deep navy, muted gold')", "lighting": "one locked lighting setup/mood reused in every scene (e.g. 'low-key single-source side light')", "lens_style": "one locked camera/lens treatment reused in every scene (e.g. '35mm, shallow depth of field, slight film grain')", "motif": "one recurring visual object, texture, or graphic element that reappears across scenes to visually tie them together" },
  "script": [ { "time": "0-3s", "line": "spoken/voiceover line", "note": "short delivery/visual direction note" } ],
  "storyboard": [ { "scene": 1, "duration": "3s", "visual": "detailed description of what's on screen (no human faces/talking heads - faceless style: b-roll, animation, text, stock-style footage, close-ups of objects/hands, motion graphics etc)", "on_screen_text": "overlay text or empty string", "camera": "shot type e.g. close-up, top-down, slow zoom" } ],
  "prompts": [ { "scene": 1, "image_prompt": "a single detailed prompt for an AI image generator (Midjourney/DALL-E style) matching the chosen visual style AND literally restating the visual_bible's subject/palette/lighting/lens wording", "video_prompt": "a single detailed prompt for an AI video generator (Runway/Kling/Sora style), including camera movement and duration, written as a continuation of the previous scene's shot", "continuity_note": "one sentence stating exactly what carries over unchanged from the previous scene (subject, setting, lighting, palette) and what is new in this scene (camera move/action/detail) - for scene 1, state how it establishes the visual_bible" } ],
  "caption": "a ready-to-post caption with a hook line and soft CTA",
  "hashtags": ["5-8 relevant hashtags without the # symbol"]
}

VIRALITY & RETENTION FRAMEWORK (apply every one of these, every time):

1. HOOK (first 1-2 seconds decide 80% of outcome):
   - Open with one of: a contrarian claim, a curiosity gap ("the reason X happens isn't what you think"), a specific surprising stat/fact, a direct callout of the viewer's situation, or a visible stakes/consequence statement.
   - 6-12 words. Never a greeting, never "in this video," never a soft warm-up sentence.
   - The hook must create an OPEN LOOP — a question or tension the viewer needs resolved. Plan the script so that loop closes by the final 3 seconds (payoff), not before — this is what drives full watch-through.

2. PACING & PATTERN INTERRUPTS:
   - Every scene is 2-5 seconds. Never exceed 5s on any single scene — this is a hard technical limit, but aim for variety (mix 2s, 3s, 4s beats) rather than uniform pacing, since uniform pacing reads as monotonous even if compliant.
   - Change the visual, camera angle, or on-screen element at every single scene cut — never repeat the same static shot across two consecutive scenes.
   - Escalate: each scene should raise stakes, add new information, or deepen the curiosity gap versus the previous one. Never plateau.

3. TEXT OVERLAYS (the silent-watch majority depends on these):
   - At least 80% of scenes carry a short on-screen text overlay (1-6 words) — this is stricter than minimum viable, because overlays are the single biggest lever for sound-off retention.
   - Overlays punch up or restate the key word of the line in punchier language — never a verbatim copy of the spoken line.

4. SCRIPT DELIVERY: short declarative sentences, average under 12 words per line (not just under the 15-word ceiling — tighter is stronger). Cut filler words ("basically," "so," "actually," "you know").

5. PAYOFF & LOOP CLOSURE: the final script line must resolve the hook's open loop explicitly — the viewer should feel "oh, THAT'S why" or "there it is." A hook with no resolution is a failed hook even if it's catchy.

6. VISUAL/AI PROMPT QUALITY: every image_prompt and video_prompt must be 15-30 words of dense, concrete visual language — concrete nouns, a camera move (dolly/pan/tilt/tracking/macro/static), a lighting descriptor (moody/studio/golden-hour/harsh/soft), and a composition note (close-up/wide/top-down/depth of field). No vague prompts like "a nice shot of X." Weave this visual style into every single prompt: "${visualStyle}".

7. GROWTH CTA: caption or final script line ends with ONE native-feeling engagement trigger — a comment-bait question, "save this for later," or "follow for part 2." Never generic sales language ("subscribe to my channel," "link in bio," "visit my website").

8. STRUCTURAL RULES: storyboard and prompts arrays must align 1:1 by scene number, covering the full script duration. Scene count roughly one per 2-4 seconds of runtime. Never include real people, real brand names, or copyrighted characters. Never use placeholder text of any kind.

9. VISUAL CONTINUITY (CRITICAL — this must look like one continuous film, never a slideshow of unrelated images): before writing any prompts, lock the visual_bible fields (subject, setting, palette, lighting, lens_style, motif) and do not change them for the rest of the video. Every single image_prompt and video_prompt must literally reuse that same locked wording (not a paraphrase — the same descriptor phrases) alongside the scene-specific action, so a reader could tell every scene came from the same shoot. Never introduce a new subject, new color palette, new lighting mood, or new location outside what the bible defines. Write each video_prompt as if the camera is continuing from where the previous scene's shot ended, not starting cold. Fill continuity_note for every scene explaining exactly what carries over and what's new. In production, the person should also generate scenes in order and feed each finished scene's output image/frame forward as the reference/init-image for the next scene wherever their chosen tool supports it (e.g. Midjourney --cref/--sref, Stable Diffusion img2img with a fixed seed, Runway/Kling/Luma start-frame chaining) — mention this briefly if relevant, since prompt wording alone is not the whole story.

Think of every generation as a video that must survive being judged against genuinely viral content in the same niche — not just "technically valid." Weak, generic, or safe choices are the failure mode to avoid.`;

function buildUserMessage(topic, length, tone, extra) {
  return `Niche/topic: ${topic}
Target length: ${length}
Tone: ${tone}
${extra ? "Additional requirements: " + extra : ""}`;
}

function parsePackage(rawText) {
  return robustParseJSON(rawText);
}

/**
 * Preferred path: ask the connected agent to sample its own current
 * model via MCP. Throws if the client doesn't support sampling, so the
 * caller can fall back.
 */
async function callViaSampling(mcpServer, topic, length, tone, visualStyle, extra, systemPrompt) {
  const result = await mcpServer.server.createMessage({
    messages: [
      {
        role: "user",
        content: { type: "text", text: buildUserMessage(topic, length, tone, extra) },
      },
    ],
    systemPrompt: systemPrompt || SYSTEM_PROMPT(visualStyle),
    maxTokens: 4000,
  });

  const text = result?.content?.type === "text" ? result.content.text : "";
  if (!text) throw new Error("Sampling returned no text content.");
  return parsePackage(text);
}

/**
 * Fallback path A: call the secure local provider router. This lets the MCP
 * server use Anthropic, OpenAI, OpenCode Zen, OpenCode Go, Neuralwatt, custom
 * OpenAI-compatible endpoints, or the Codex CLI OAuth bridge without putting
 * keys in MCP config.
 */
async function callViaProviderRouter(provider, topic, length, tone, visualStyle, extra, systemPrompt, imageTool, videoTool) {
  if (!ROUTER_URL) throw new Error("FCT_ROUTER_URL is not set.");
  const resp = await fetch(`${ROUTER_URL}/v1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: provider || "auto",
      max_tokens: 4000,
      system: systemPrompt || SYSTEM_PROMPT(visualStyle),
      messages: [{ role: "user", content: buildUserMessage(topic, length, tone, extra) }],
      imageTool: imageTool || 'generic',
      videoTool: videoTool || 'generic',
      length: length
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Provider router error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const raw = (data.content || []).map((b) => b.text || "").join("\n");
  return parsePackage(raw);
}

/**
 * Fallback path B: legacy Anthropic direct fallback. Kept for backwards compatibility.
 */
async function callDirectApi(topic, length, tone, visualStyle, extra, systemPrompt) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: FALLBACK_MODEL,
      max_tokens: 4000,
      system: systemPrompt || SYSTEM_PROMPT(visualStyle),
      messages: [{ role: "user", content: buildUserMessage(topic, length, tone, extra) }],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const raw = (data.content || []).map((b) => b.text || "").join("\n");
  return parsePackage(raw);
}

const server = new McpServer({
  name: "faceless-content-generator",
  version: "1.2.0",
});

server.tool(
  "generate_faceless_content",
  "Generates a complete faceless short-form video package for any niche/topic: hook, timestamped script, scene-by-scene storyboard, and paste-ready AI image/video generation prompts. Use for YouTube Shorts, TikTok, or Reels content planning.",
  {
    topic: z.string().describe("The niche or topic, e.g. 'weird ocean facts' or 'personal finance for teens'"),
    length: z
      .enum(["15-20 seconds", "30-40 seconds", "45-60 seconds", "60-90 seconds"])
      .default("30-40 seconds")
      .describe("Target video length"),
    tone: z
      .string()
      .default("punchy, high-energy, curiosity-driven")
      .describe("Tone/style of the video, e.g. 'calm, cinematic, documentary-style'"),
    visual_style: z
      .string()
      .default("cinematic realism, moody lighting, shallow depth of field")
      .describe("Visual style to bake into every image/video prompt, e.g. 'anime style', 'claymation', '3D pixar-style'"),
    extra: z
      .string()
      .optional()
      .describe("Any specific fact, angle, product, or CTA to include"),
    provider: z
      .enum(["auto", "anthropic", "openai", "opencode_zen", "opencode_go", "neuralwatt", "codex_oauth", "custom_openai_compatible"])
      .default("auto")
      .describe("Optional direct provider preset. Used only when FCT_FORCE_DIRECT_PROVIDER=true or when MCP sampling is unavailable and FCT_ROUTER_URL is set."),
    image_tool: z
      .string()
      .default("generic")
      .describe("AI image generator preset (e.g. 'midjourney', 'dalle')"),
    video_tool: z
      .string()
      .default("generic")
      .describe("AI video generator preset (e.g. 'sora', 'runway', 'kling')"),
  },
  async ({ topic, length, tone, visual_style, extra, provider, image_tool, video_tool }) => {
    const imageTool = image_tool || 'generic';
    const videoTool = video_tool || 'generic';

    // Capped at 2 attempts: scoring is deterministic/instant (no extra LLM call),
    // so quality decisions add zero latency — only a genuine regeneration does,
    // and a stronger first-pass prompt should make a second attempt rare.
    const maxAttempts = 2;
    const QUALITY_RETRY_THRESHOLD = 70;
    let attempt = 0;
    let lastErrorMsg = '';
    let pkg = null;
    let qa = null;
    let ok = false;

    while (attempt < maxAttempts) {
      attempt++;
      console.error(`[faceless-content-mcp] Generation attempt ${attempt}/${maxAttempts}...`);

      let activeSystemPrompt = SYSTEM_PROMPT(visual_style);
      if (attempt > 1) {
        activeSystemPrompt = `${SYSTEM_PROMPT(visual_style)}\n\nIMPORTANT: Your previous output needs correction:\n${lastErrorMsg}\n\nFix these specific issues, keep scene numbers aligned 1:1, and return ONLY valid JSON.`;
      }

      try {
        try {
          if (FORCE_DIRECT_PROVIDER) throw new Error("Direct provider forced by FCT_FORCE_DIRECT_PROVIDER.");
          pkg = await callViaSampling(server, topic, length, tone, visual_style, extra, activeSystemPrompt);
        } catch (samplingErr) {
          if (ROUTER_URL) {
            pkg = await callViaProviderRouter(provider, topic, length, tone, visual_style, extra, activeSystemPrompt, imageTool, videoTool);
          } else if (API_KEY) {
            pkg = await callDirectApi(topic, length, tone, visual_style, extra, activeSystemPrompt);
          } else {
            throw new Error(
              `Sampling isn't supported by this client, and no fallback provider is configured. ` +
                `Use a sampling-capable client, set FCT_ROUTER_URL=http://127.0.0.1:3737 and run secure-provider-server.js, ` +
                `or set ANTHROPIC_API_KEY for the legacy fallback. (Sampling error: ${samplingErr.message})`
            );
          }
        }

        pkg = enforceVisualConsistency(pkg, imageTool);

        const qaErrors = validateVideoPackage(pkg, imageTool, videoTool, length);
        if (qaErrors.length > 0) {
          console.error(`[faceless-content-mcp] Hard validation failed on attempt ${attempt}:`, qaErrors);
          lastErrorMsg = qaErrors.map(e => `- ${e}`).join('\n');
          continue;
        }

        qa = scoreVideoPackage(pkg, imageTool, videoTool, length);
        console.error(`[faceless-content-mcp] QA score on attempt ${attempt}: ${qa.overall}/100 (${qa.grade})`);

        if (qa.overall >= QUALITY_RETRY_THRESHOLD || attempt === maxAttempts) {
          ok = true;
          break;
        }

        lastErrorMsg = qa.flags.map(f => `- ${f}`).join('\n') || '- Overall quality score below target; strengthen weak categories.';
      } catch (err) {
        console.error(`[faceless-content-mcp] Attempt ${attempt} failed: ${err.message}`);
        lastErrorMsg = `- Generation or JSON parsing failed: ${err.message}`;
      }
    }

    if (!ok || !pkg) {
      return {
        content: [{ type: "text", text: `Error generating content after ${maxAttempts} attempts. Last issue(s):\n${lastErrorMsg}` }],
        isError: true,
      };
    }

    // Always attach QA scores (compute if this attempt hasn't already) so the
    // person sees a score breakdown on every single output, not just failures.
    if (!qa) qa = scoreVideoPackage(pkg, imageTool, videoTool, length);
    pkg.qa = qa;

    return {
      content: [{ type: "text", text: JSON.stringify(pkg, null, 2) }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  `[faceless-content-mcp] Server running on stdio. Sampling-first mode; ` +
    (ROUTER_URL
      ? `secure provider router fallback set (${ROUTER_URL}).`
      : API_KEY
        ? `legacy Anthropic fallback set (model: ${FALLBACK_MODEL}).`
        : `fallback not set.`)
);
