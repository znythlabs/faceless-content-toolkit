# Faceless Content Toolkit — secure multi-provider build

This build keeps the original generator, but adds a **secure local provider router** so the standalone browser file can use different providers without storing API keys in the browser.

## What changed

- `faceless_content_generator.html` no longer asks for an Anthropic key in the browser.
- `secure-provider-server.js` runs locally on `127.0.0.1` and reads keys from `.env`.
- Provider presets are included for:
  - Anthropic API
  - OpenAI API
  - OpenCode Zen
  - OpenCode Go
  - Neuralwatt
  - Custom OpenAI-compatible providers
  - Experimental Codex OAuth through the local Codex CLI
- `index.js` MCP mode still uses MCP sampling first, but can fall back to the secure router if the MCP client does not support sampling.

## Secure standalone setup

```bash
cd faceless-content-toolkit
npm install
cp .env.example .env
```

Edit `.env` and add only the provider keys you want. Example for OpenCode Go:

```bash
OPENCODE_GO_API_KEY=your-key-here
OPENCODE_GO_MODEL=deepseek-v4-flash
OPENCODE_GO_CHAT_URL=https://opencode.ai/zen/go/v1/chat/completions
```

Start the secure router:

```bash
npm run start:router
# or
node secure-provider-server.js
```

Then open `faceless_content_generator.html` in your browser, choose the provider preset, keep the router URL as:

```text
http://127.0.0.1:3737
```

Click **Check**. It should show which providers are configured.

## Provider notes

### OpenCode Zen

Default preset:

```bash
OPENCODE_ZEN_API_KEY=your-key-here
OPENCODE_ZEN_MODEL=deepseek-v4-pro
OPENCODE_ZEN_CHAT_URL=https://opencode.ai/zen/v1/chat/completions
```

For an Anthropic-compatible Zen model such as `qwen3.7-plus`, switch the protocol:

```bash
OPENCODE_ZEN_MODEL=qwen3.7-plus
OPENCODE_ZEN_CHAT_URL=https://opencode.ai/zen/v1/messages
OPENCODE_ZEN_PROTOCOL=anthropic_compatible
OPENCODE_ZEN_AUTH_SCHEME=x-api-key
```

### OpenCode Go

Default preset:

```bash
OPENCODE_GO_API_KEY=your-key-here
OPENCODE_GO_MODEL=deepseek-v4-flash
OPENCODE_GO_CHAT_URL=https://opencode.ai/zen/go/v1/chat/completions
```

For Go models that use the `/messages` endpoint:

```bash
OPENCODE_GO_MODEL=qwen3.7-plus
OPENCODE_GO_CHAT_URL=https://opencode.ai/zen/go/v1/messages
OPENCODE_GO_PROTOCOL=anthropic_compatible
OPENCODE_GO_AUTH_SCHEME=x-api-key
```

### Neuralwatt

```bash
NEURALWATT_API_KEY=your-key-here
NEURALWATT_MODEL=Qwen/Qwen3-Coder-480B-A35B-Instruct
NEURALWATT_CHAT_URL=https://api.neuralwatt.com/v1/chat/completions
```

### Codex OAuth bridge

This does **not** expose your ChatGPT/Codex token to the browser. It shells out to your local Codex CLI, which should already be logged in.

```bash
codex login
```

Then in `.env`:

```bash
CODEX_OAUTH_ENABLED=true
CODEX_MODEL=gpt-5-codex
CODEX_BIN=codex
```

This route depends on your installed Codex CLI supporting non-interactive `codex exec` usage. If your Codex CLI version changes the command syntax, update `secure-provider-server.js` in the `callCodexCli()` function.

## MCP setup with the secure router

Start the router:

```bash
node secure-provider-server.js
```

Then add the MCP server as usual. To make MCP fallback to the router when sampling is unavailable:

```json
{
  "mcpServers": {
    "faceless_content": {
      "command": "node",
      "args": ["/absolute/path/to/faceless-content-toolkit/index.js"],
      "env": {
        "FCT_ROUTER_URL": "http://127.0.0.1:3737"
      }
    }
  }
}
```

To force MCP to bypass sampling and use the router directly:

```json
{
  "env": {
    "FCT_ROUTER_URL": "http://127.0.0.1:3737",
    "FCT_FORCE_DIRECT_PROVIDER": "true"
  }
}
```

## Security rules used in this build

- Keys live in `.env` or environment variables, not in browser localStorage.
- `.env` is ignored by Git.
- The router binds to `127.0.0.1` by default, not the public network.
- The router only accepts local requests.
- Provider names are allowlisted; the browser cannot send arbitrary URLs to the router.
- The browser only sends prompts and provider IDs, never secrets.
- Do not deploy `secure-provider-server.js` publicly unless you add real auth, rate limiting, HTTPS, logging controls, and user isolation.

---

# Faceless Content Toolkit

This folder has two ways to use the same generator — pick whichever fits how you work:

- **`faceless_content_generator.html`** — open this directly in a browser. Fill in the form (niche, length, tone, visual style) and it generates the script, storyboard, and image/video prompts inline, with a "Recent Generations" history saved automatically.
  - **Free route — as a Claude.ai artifact:** paste the full file contents (or upload the file) into a chat at claude.ai and ask Claude to "turn this into an artifact." It renders live in the side panel, no API key needed, no cost beyond your existing Claude.ai usage — works on the Free plan. This is the recommended way to use it if you don't want to pay for API access.
  - **Standalone — as a plain downloaded file:** start `secure-provider-server.js`, then double-click the file. The page talks to the local router at `127.0.0.1`; API keys stay in `.env`, not in browser storage.
- **`index.js` + `package.json`** — the MCP server version. Your AI agent (Hermes, omp, Claude Desktop, etc.) calls this directly and generates content on request, no browser needed. By default it runs key-free via MCP sampling, following whatever model your agent is using. If sampling is unavailable, use `FCT_ROUTER_URL` to fall back to the secure provider router.
- **`setup-guide.html`** — step-by-step walkthrough for wiring the MCP server into your agent.

Both versions use the identical prompt/schema, so results are consistent either way.

## Niche workflow Library (new)

The HTML tool now has two tabs: **Generate** and **Library**.

- **Library tab** — upload a `.md`/`.txt` file (or paste text) describing a niche's workflow/pipeline: hook formulas, pacing rules, visual style notes, prompt patterns, CTA style, whatever you've got, in whatever format you already have it. Click "Import & Normalize" and Claude reformats it into a uniform structure (hook style, script structure, tone/visual defaults, storyboard rules, prompt style, CTA style, hashtag strategy, pacing notes, extra rules) and saves it to your library. Every entry ends up in the same shape regardless of how messy the source was.
- **Generate tab** — a "Niche workflow" dropdown at the top lets you pick a saved library entry to guide that generation, or leave it on "Built-in — viral-optimized default."
- **No workflow selected** — the tool falls back to a built-in playbook tuned for virality/retention/engagement (hook timing, pattern-interrupt pacing, open-loop structure, native CTA phrasing, prompt cohesion, etc.), so it still produces strong output for any niche with zero setup.

Library entries are saved via the same storage mechanism as generation history (Claude's built-in artifact storage when run in Claude, local browser storage when run standalone), so they persist between sessions on the same device/account. Only history/workflows are stored in the browser; API keys are not.

## Niche category selector (new)

A "Niche category" dropdown on the Generate tab lets you lock output to one of 13 built-in niches, curated for **high RPM / advertiser-friendly** content rather than volume-driven meme niches: personal finance, business, real estate, tech/AI, health, legal, insurance, cybersecurity, career, luxury lifestyle, science & space, plus two BBC Earth-style documentary niches — **nature & wildlife** and **human body & anatomy**. Selecting one of the two documentary niches also auto-sets the tone to "calm, cinematic, documentary-style" and pre-fills a matching BBC Earth-style visual style for the image/video prompts (you can still edit both). Pick a niche and leave Topic blank to let Claude choose a strong angle within it, or add a specific angle to narrow it further. This is separate from the Library — the niche selector is a quick built-in category lock, while Library workflows are your own custom pipelines (you can use both together: pick a niche category *and* a matching library workflow).

## Image/video prompt formatting (new)

Two more dropdowns — "Image prompt formatted for" and "Video prompt formatted for" — let you target a specific generator (Midjourney, DALL·E 3, Stable Diffusion, SeeDream / Sora, Runway, Kling, LTX Video, Dream Machine). The tool writes `image_prompt` and `video_prompt` in that tool's native prompt style (e.g. Midjourney's comma-separated descriptor syntax with `--ar`/`--style` params vs. DALL·E's prose style) instead of one generic format.

### About `prompt-master-reference/`

This folder is a copy of the `prompt-master` skill included for reference/reuse in other tools (e.g. Claude Code) — it's not loaded at runtime by the generator itself. Its tool-routing content covers dozens of AI systems (Cursor, Claude Code, ComfyUI, Zapier, etc.) that are irrelevant to this specific tool and would just add token cost to every API call. Instead, the image/video-AI formatting guidance relevant to this generator's `image_prompt`/`video_prompt` fields was extracted and adapted directly into the app's built-in prompt logic (see the dropdowns above).

---

# Faceless Content MCP Server

Turns the video-package generator (script + storyboard + image/video prompts)
into a tool any MCP-compatible agent can call directly — no browser tab needed.

## 1. Install

Unzip `faceless-content-toolkit.zip` into a permanent folder, then install dependencies from inside it:

```bash
mkdir -p ~/tools
unzip faceless-content-toolkit.zip -d ~/tools/faceless-content-toolkit
cd ~/tools/faceless-content-toolkit
npm install
```

## 2. API key — usually not needed

`index.js` uses **MCP sampling** by default: it asks your *connected agent* to run
the completion on whatever model that agent is currently using, instead of calling
the Anthropic API itself. That means:

- No API key, no separate billing
- The tool automatically follows your agent if you switch its model later
- Works out of the box in any sampling-capable client (Claude Desktop, Hermes)

For clients that don't support sampling, use the secure router fallback. Start
`secure-provider-server.js`, set your chosen provider key in `.env`, then add
`FCT_ROUTER_URL=http://127.0.0.1:3737` to the MCP server config. The older
`ANTHROPIC_API_KEY` fallback still works for backwards compatibility, but the
router is recommended.

## 3. Test it standalone (optional)

```bash
node index.js
```

It should print `[faceless-content-mcp] Server running on stdio. Sampling-first mode; fallback not set.` or mention a router fallback if `FCT_ROUTER_URL` is configured.
and then wait — that's correct, it's speaking MCP over stdio and expects an MCP
client to talk to it, not a human. Ctrl+C to stop.

## 4. Connect it to Hermes Agent

Add to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  faceless_content:
    command: "node"
    args: ["/absolute/path/to/faceless-content-toolkit/index.js"]
```

Then restart Hermes (or let it auto-reload). The tool will show up as
`mcp_faceless_content_generate_faceless_content`. You can then just ask Hermes
things like: *"Generate a faceless Shorts package about ancient Rome myths."*

## 5. Connect it to Oh My Pi (omp)

omp speaks MCP natively (stdio or HTTP transport, same JSON-RPC shape as
Claude Desktop/Cursor). Add an entry to `~/.omp/agent/mcp.json`:

```json
{
  "mcpServers": {
    "faceless_content": {
      "command": "node",
      "args": ["/absolute/path/to/faceless-content-toolkit/index.js"]
    }
  }
}
```

Restart omp. The tool is registered as `mcp__faceless_content_generate_faceless_content`
(omp lowercases and sanitizes server/tool names). You can then just ask omp:
*"Generate a faceless Shorts package about ancient Rome myths."*

## 6. Connect it to Claude Desktop / Cursor / any other MCP client

Same idea — most MCP clients use a `mcpServers` (or `mcp_servers`) block in a
JSON/YAML config pointing at a `command` + `args`. Example (Claude Desktop
`claude_desktop_config.json` style):

```json
{
  "mcpServers": {
    "faceless_content": {
      "command": "node",
      "args": ["/absolute/path/to/faceless-content-toolkit/index.js"]
    }
  }
}
```

## 7. If your client doesn't support sampling

Start the secure provider router first:

```bash
node secure-provider-server.js
```

Then add `FCT_ROUTER_URL` to the MCP config entry:

```json
{
  "mcpServers": {
    "faceless_content": {
      "command": "node",
      "args": ["/absolute/path/to/faceless-content-toolkit/index.js"],
      "env": { "FCT_ROUTER_URL": "http://127.0.0.1:3737" }
    }
  }
}
```

This lets the MCP server fall back to any configured router provider: Anthropic, OpenAI, OpenCode Zen, OpenCode Go, Neuralwatt, a custom OpenAI-compatible endpoint, or the Codex CLI OAuth bridge.

## What the tool does

Calling `generate_faceless_content` with a topic (and optional length, tone,
visual_style, extra) returns a single JSON object containing:

- `title`, `hook`
- `script` — timestamped lines with delivery notes
- `storyboard` — scene-by-scene shot list (camera, visual, on-screen text)
- `prompts` — one image prompt + one video prompt per scene, ready to paste
  into Midjourney/DALL·E/ChatGPT image gen and Runway/Kling/Sora
- `caption` and `hashtags`

This is the exact same prompt and JSON schema used by the standalone HTML
tool, so structure and quality stay consistent whether you run it from the
browser tool or from an agent. The only difference is which model produces
it: the browser tool always uses `claude-sonnet-5`; the MCP server follows
your agent's current model via sampling (or `claude-sonnet-5` if it falls
back to the API key path).


## Troubleshooting: router runs but Generate fails

If `http://127.0.0.1:3737` opens in your browser, the router is running. Use `http://127.0.0.1:3737/health` to see which providers are configured.

If the terminal says something like:

```text
Configured providers: openai:gpt-5.5
```

but the UI provider dropdown is set to **Codex OAuth**, generation will fail because Codex OAuth is not configured yet. Either select **Auto** or **OpenAI API**, or enable Codex OAuth:

```powershell
# one-time Codex setup
codex login
codex login status

# then edit .env
CODEX_OAUTH_ENABLED=true
CODEX_MODEL=gpt-5-codex

# restart router
npm run start:router
```

`CODEX_OAUTH_ENABLED=true` is intentionally required so the router does not silently invoke your Codex account without you opting in.
