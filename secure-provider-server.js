#!/usr/bin/env node
/**
 * Secure local provider router for the Faceless Content Toolkit.
 *
 * Why this exists:
 * - Browser localStorage is not a safe place for long-lived API keys.
 * - This server keeps provider keys in environment variables / .env on your machine.
 * - The HTML app sends prompts to http://127.0.0.1 only; keys never reach the browser.
 *
 * Start:
 *   cp .env.example .env
 *   edit .env
 *   node secure-provider-server.js
 */

import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { robustParseJSON, validateVideoPackage, scoreVideoPackage } from './validation.js';

loadDotEnv(resolve(process.cwd(), '.env'));

const HOST = process.env.FCT_HOST || '127.0.0.1';
const PORT = Number(process.env.FCT_PORT || 3737);
const MAX_BODY_BYTES = Number(process.env.FCT_MAX_BODY_BYTES || 1_000_000);
const REQUEST_TIMEOUT_MS = Number(process.env.FCT_REQUEST_TIMEOUT_MS || 300_000);

const PROVIDERS = {
  auto: {
    label: 'Auto — first configured provider',
    type: 'auto',
  },
  anthropic: {
    label: 'Anthropic API',
    type: 'anthropic_messages',
    apiKeyEnv: ['ANTHROPIC_API_KEY'],
    modelEnv: 'ANTHROPIC_MODEL',
    modelDefault: 'claude-sonnet-4-5',
    baseUrlEnv: 'ANTHROPIC_BASE_URL',
    baseUrlDefault: 'https://api.anthropic.com/v1/messages',
    authSchemeEnv: 'ANTHROPIC_AUTH_SCHEME',
    authSchemeDefault: 'x-api-key',
  },
  openai: {
    label: 'OpenAI API',
    type: 'openai_responses',
    apiKeyEnv: ['OPENAI_API_KEY'],
    modelEnv: 'OPENAI_MODEL',
    modelDefault: 'gpt-4o',
    baseUrlEnv: 'OPENAI_RESPONSES_URL',
    baseUrlDefault: 'https://api.openai.com/v1/responses',
    authSchemeEnv: 'OPENAI_AUTH_SCHEME',
    authSchemeDefault: 'bearer',
  },
  opencode_zen: {
    label: 'OpenCode Zen',
    type: 'openai_chat_compatible',
    apiKeyEnv: ['OPENCODE_ZEN_API_KEY', 'OPENCODE_API_KEY'],
    modelEnv: 'OPENCODE_ZEN_MODEL',
    modelDefault: 'deepseek-v4-pro',
    baseUrlEnv: 'OPENCODE_ZEN_CHAT_URL',
    baseUrlDefault: 'https://opencode.ai/zen/v1/chat/completions',
    authSchemeEnv: 'OPENCODE_ZEN_AUTH_SCHEME',
    authSchemeDefault: 'bearer',
    protocolEnv: 'OPENCODE_ZEN_PROTOCOL',
  },
  opencode_go: {
    label: 'OpenCode Go',
    type: 'openai_chat_compatible',
    apiKeyEnv: ['OPENCODE_GO_API_KEY', 'OPENCODE_API_KEY'],
    modelEnv: 'OPENCODE_GO_MODEL',
    modelDefault: 'deepseek-v4-flash',
    baseUrlEnv: 'OPENCODE_GO_CHAT_URL',
    baseUrlDefault: 'https://opencode.ai/zen/go/v1/chat/completions',
    authSchemeEnv: 'OPENCODE_GO_AUTH_SCHEME',
    authSchemeDefault: 'bearer',
    protocolEnv: 'OPENCODE_GO_PROTOCOL',
  },
  neuralwatt: {
    label: 'Neuralwatt',
    type: 'openai_chat_compatible',
    apiKeyEnv: ['NEURALWATT_API_KEY'],
    modelEnv: 'NEURALWATT_MODEL',
    modelDefault: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
    baseUrlEnv: 'NEURALWATT_CHAT_URL',
    baseUrlDefault: 'https://api.neuralwatt.com/v1/chat/completions',
    authSchemeEnv: 'NEURALWATT_AUTH_SCHEME',
    authSchemeDefault: 'bearer',
  },
  nine_router: {
    label: '9router',
    type: 'openai_chat_compatible',
    apiKeyEnv: ['NINE_ROUTER_API_KEY'],
    modelEnv: 'NINE_ROUTER_MODEL',
    modelDefault: 'gpt-4o',
    baseUrlEnv: 'NINE_ROUTER_CHAT_URL',
    baseUrlDefault: 'https://api.9router.cc/v1/chat/completions',
    authSchemeEnv: 'NINE_ROUTER_AUTH_SCHEME',
    authSchemeDefault: 'bearer',
  },
  custom_openai_compatible: {
    label: 'Custom OpenAI-compatible',
    type: 'openai_chat_compatible',
    apiKeyEnv: ['CUSTOM_API_KEY'],
    modelEnv: 'CUSTOM_MODEL',
    modelDefault: '',
    baseUrlEnv: 'CUSTOM_CHAT_URL',
    baseUrlDefault: '',
    authSchemeEnv: 'CUSTOM_AUTH_SCHEME',
    authSchemeDefault: 'bearer',
  },
  codex_oauth: {
    label: 'Codex OAuth via local Codex CLI',
    type: 'codex_cli',
    enabledEnv: 'CODEX_OAUTH_ENABLED',
    modelEnv: 'CODEX_MODEL',
    modelDefault: 'gpt-5-codex',
    binEnv: 'CODEX_BIN',
    binDefault: 'codex',
  },
};

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function isPlaceholder(value) {
  const v = String(value || '').trim().toLowerCase();
  return ['', 'sk-...', 'your-key', 'your_api_key_here', 'change-me', 'placeholder'].includes(v);
}

function codexReady(bin) {
  try {
    return spawnSync(`${bin} --version`, { stdio: 'ignore', shell: true, timeout: 5000 }).status === 0;
  } catch(e) { return false; }
}

const CODEX_BIN = process.env[PROVIDERS.codex_oauth.binEnv] || PROVIDERS.codex_oauth.binDefault;
const CODEX_BIN_AVAILABLE = codexReady(CODEX_BIN);

function envValue(name, fallback = '') {
  const val = process.env[name];
  return val && !isPlaceholder(val) ? val.trim() : fallback;
}

function firstEnv(names) {
  for (const name of Array.isArray(names) ? names : [names]) {
    const val = process.env[name];
    if (val && val.trim() && !isPlaceholder(val)) return val.trim();
  }
  return '';
}

function providerRuntime(providerId) {
  const cfg = PROVIDERS[providerId];
  if (!cfg || providerId === 'auto') return null;

  if (cfg.type === 'codex_cli') {
    const enabled = /^true|1|yes$/i.test(process.env[cfg.enabledEnv] || '');
    const bin = CODEX_BIN;
    const ready = enabled && CODEX_BIN_AVAILABLE;
    return {
      id: providerId,
      label: cfg.label,
      type: cfg.type,
      configured: ready,
      skipped: !enabled ? `${cfg.enabledEnv}=true` : ready ? '' : `Install Codex CLI or set ${cfg.binEnv} to its executable.`,
      model: process.env[cfg.modelEnv] || cfg.modelDefault,
    };
  }

  const key = firstEnv(cfg.apiKeyEnv);
  const baseUrl = envValue(cfg.baseUrlEnv, cfg.baseUrlDefault);
  const model = envValue(cfg.modelEnv, cfg.modelDefault);
  const protocolOverride = cfg.protocolEnv ? envValue(cfg.protocolEnv) : '';

  return {
    id: providerId,
    label: cfg.label,
    type: protocolOverride || cfg.type,
    configured: Boolean(key && baseUrl && model),
    model,
    baseUrl,
    authScheme: envValue(cfg.authSchemeEnv, cfg.authSchemeDefault || 'bearer'),
    apiKey: key,
  };
}

function listProviderStatus() {
  return Object.keys(PROVIDERS).map((id) => {
    if (id === 'auto') return { id, label: PROVIDERS[id].label, configured: true, model: '' };
    const p = providerRuntime(id);
    const missing = [];
    if (id === 'codex_oauth') {
      if (p.skipped) missing.push(p.skipped);
    } else {
      const cfg = PROVIDERS[id];
      if (!firstEnv(cfg.apiKeyEnv)) missing.push(Array.isArray(cfg.apiKeyEnv) ? cfg.apiKeyEnv.join(' or ') : cfg.apiKeyEnv);
      if (!p.baseUrl) missing.push(cfg.baseUrlEnv);
      if (!p.model) missing.push(cfg.modelEnv);
    }
    return { id, label: p.label, configured: p.configured, ready: p.configured, skipped: p.configured ? '' : missing.join(', '), skipReason: p.configured ? '' : missing.join(', '), model: p.model || '', missing };
  });
}

function configuredProviderIds() {
  return listProviderStatus().filter((p) => p.configured && p.id !== 'auto').map((p) => p.id);
}

function pickProvider(requested) {
  const id = requested && PROVIDERS[requested] ? requested : 'auto';
  if (id !== 'auto') {
    const p = providerRuntime(id);
    if (!p?.configured) throw new Error(`Provider "${id}" is not configured. Check your .env variables.`);
    return p;
  }
  for (const candidate of ['anthropic', 'nine_router', 'opencode_zen', 'opencode_go', 'openai', 'neuralwatt', 'custom_openai_compatible', 'codex_oauth']) {
    const p = providerRuntime(candidate);
    if (p?.configured) return p;
  }
  throw new Error('No provider is configured. Add at least one API key to .env, or enable CODEX_OAUTH_ENABLED=true after running codex login.');
}

function authHeaders(provider, headers = {}) {
  const scheme = String(provider.authScheme || 'bearer').toLowerCase();
  if (scheme === 'x-api-key') headers['x-api-key'] = provider.apiKey;
  else headers.Authorization = `Bearer ${provider.apiKey}`;
  return headers;
}

async function callModel({ providerId, system, messages, max_tokens }) {
  const provider = pickProvider(providerId);
  const userText = messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n');
  const maxTokens = Math.min(Number(max_tokens || 8000), 16000);

  let text;
  if (provider.type === 'anthropic_messages') {
    text = await callAnthropicMessages(provider, system, messages, maxTokens);
  } else if (provider.type === 'openai_responses') {
    text = await callOpenAIResponses(provider, system, userText, maxTokens);
  } else if (provider.type === 'openai_chat_compatible') {
    text = await callOpenAICompatibleChat(provider, system, messages, maxTokens);
  } else if (provider.type === 'anthropic_compatible') {
    text = await callAnthropicMessages(provider, system, messages, maxTokens);
  } else if (provider.type === 'codex_cli') {
    text = await callCodexCli(provider, system, userText, maxTokens);
  } else {
    throw new Error(`Unsupported provider protocol: ${provider.type}`);
  }

  return {
    provider: { id: provider.id, label: provider.label, model: provider.model },
    content: [{ type: 'text', text }],
  };
}

async function fetchWithTimeout(url, options) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function callAnthropicMessages(provider, system, messages, maxTokens) {
  const headers = authHeaders(provider, {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  });
  const response = await fetchWithTimeout(provider.baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: provider.model, max_tokens: maxTokens, system, messages }),
  });
  if (!response.ok) throw await apiError('Anthropic-compatible API', response);
  const data = robustParseJSON(await response.text());
  return (data.content || []).map((b) => b.text || '').join('\n').trim();
}

async function callOpenAIResponses(provider, system, userText, maxTokens) {
  const response = await fetchWithTimeout(provider.baseUrl, {
    method: 'POST',
    headers: authHeaders(provider, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      model: provider.model,
      max_output_tokens: maxTokens,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: userText },
      ],
    }),
  });
  if (!response.ok) throw await apiError('OpenAI Responses API', response);
  const data = robustParseJSON(await response.text());
  if (typeof data.output_text === 'string') return data.output_text.trim();
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .map((part) => part.text || part.output_text || '')
    .join('\n')
    .trim();
}

async function callOpenAICompatibleChat(provider, system, messages, maxTokens) {
  const response = await fetchWithTimeout(provider.baseUrl, {
    method: 'POST',
    headers: authHeaders(provider, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: 'system', content: system },
        ...messages.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })),
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });
  if (!response.ok) throw await apiError('OpenAI-compatible chat API', response);
  const rawBody = await response.text();
  const data = robustParseJSON(rawBody);
  const choices = data.choices || [];
  const text = choices.map((c) => c.message?.content || c.text || '').join('\n').trim();
  if (!text) {
    const hasReasoning = choices.some((c) => c.message?.reasoning_content);
    if (hasReasoning) {
      throw new Error(`Model returned reasoning but empty content — max_tokens (${maxTokens}) likely too low for reasoning model. Increase max_tokens to 8000+.`);
    }
    throw new Error(`OpenAI-compatible chat returned empty content. Raw response: ${rawBody.slice(0, 300)}`);
  }
  return text;
}

/**
 * Stream OpenAI-compatible chat completions. Yields {chunk: text} for each
 * content delta, then {done: true, fullText: "..."} when the stream ends.
 */
async function* callOpenAICompatibleChatStream(provider, system, messages, maxTokens) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    const reqBody = JSON.stringify({
      model: provider.model,
      messages: [
        { role: 'system', content: system },
        ...messages.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })),
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
      stream: true,
    });
    response = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: authHeaders(provider, { 'Content-Type': 'application/json' }),
      body: reqBody,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }

  if (!response.ok) throw await apiError('OpenAI-compatible chat API stream', response);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const json = trimmed.slice(5).trim();
        if (json === '[DONE]') {
          // Flush any residual buffer before declaring done
          if (buffer.trim()) {
            try {
              const raw = buffer.trim();
              const json = raw.startsWith('data:') ? raw.slice(5).trim() : raw;
              if (!json || json === '[DONE]') { yield { done: true, fullText }; return; }
              const tail = JSON.parse(json);
              const tailDelta = tail.choices?.[0]?.delta?.content || '';
              if (tailDelta) { fullText += tailDelta; yield { chunk: tailDelta }; }
            } catch {}
          }
          yield { done: true, fullText };
          return;
        }
        try {
          const parsed = JSON.parse(json);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullText += delta;
            yield { chunk: delta };
          }
        } catch {
          // skip unparseable SSE lines
        }
      }
    }
    // Flush residual buffer after stream ends
    if (buffer.trim()) {
      try {
        const raw = buffer.trim();
        const json = raw.startsWith('data:') ? raw.slice(5).trim() : raw;
        if (!json || json === '[DONE]') { yield { done: true, fullText }; return; }
        const tail = JSON.parse(json);
        const tailDelta = tail.choices?.[0]?.delta?.content || '';
        if (tailDelta) { fullText += tailDelta; yield { chunk: tailDelta }; }
      } catch {}
    }
    yield { done: true, fullText };
  } finally {
    reader.releaseLock();
  }
}

function callCodexCli(provider, system, userText, maxTokens) {
  return new Promise((resolvePromise, reject) => {
    const bin = process.env[PROVIDERS.codex_oauth.binEnv] || PROVIDERS.codex_oauth.binDefault;
    const args = ['exec', '--skip-git-repo-check', '--model', provider.model, '-'];
    const prompt = `${system}\n\n${userText}\n\nReturn only the final answer text. Max output target: ${maxTokens} tokens.`;
    const child = spawn(bin, args, {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Codex CLI timed out.'));
    }, REQUEST_TIMEOUT_MS);
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(err.code === 'ENOENT' ? `Could not start Codex CLI. Install Codex CLI or set ${PROVIDERS.codex_oauth.binEnv} to its executable.` : `Could not start Codex CLI: ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Codex CLI exited with ${code}: ${stderr || stdout}`));
        return;
      }
      resolvePromise(stdout.trim());
    });
    child.stdin.end(prompt);
  });
}

async function apiError(label, response) {
  let body = '';
  try { body = await response.text(); } catch (_) {}
  return new Error(`${label} error ${response.status}: ${body.slice(0, 1200)}`);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, corsHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  }));
  res.end(body);
}

function corsHeaders(headers = {}) {
  return {
    ...headers,
    'Access-Control-Allow-Origin': 'null',
    'Access-Control-Allow-Headers': 'Content-Type, X-FCT-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cross-Origin-Resource-Policy': 'same-site',
  };
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolvePromise(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function validateLocal(req) {
  const remote = req.socket.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) return false;
  const required = process.env.FCT_LOCAL_TOKEN;
  if (required && req.headers['x-fct-token'] !== required) return false;
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }
    if (!validateLocal(req)) {
      sendJson(res, 403, { error: 'Forbidden. This server only accepts local requests.' });
      return;
    }
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/wildlife')) {
      const htmlPath = resolve(process.cwd(), 'wildlife_documentary_generator.html');
      if (existsSync(htmlPath)) {
        const html = readFileSync(htmlPath, 'utf8');
        res.writeHead(200, corsHeaders({ 'Content-Type': 'text/html; charset=utf-8' }));
        res.end(html);
        return;
      }
      sendJson(res, 200, {
        ok: true,
        service: 'faceless-content-router',
        message: 'Router is running (no HTML found alongside). Use /health and /v1/messages.',
        health: `http://${HOST}:${PORT}/health`,
        configuredProviders: configuredProviderIds(),
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/legacy') {
      const htmlPath = resolve(process.cwd(), 'faceless_content_generator.html');
      if (existsSync(htmlPath)) {
        const html = readFileSync(htmlPath, 'utf8');
        res.writeHead(200, corsHeaders({ 'Content-Type': 'text/html; charset=utf-8' }));
        res.end(html);
        return;
      }
      sendJson(res, 404, { error: 'Legacy generator not found.' });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true, providers: listProviderStatus() });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/providers') {
      sendJson(res, 200, { providers: listProviderStatus() });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/v1/messages/stream') {
      const body = await readBody(req);
      if (!body.system || !Array.isArray(body.messages)) {
        sendJson(res, 400, { error: 'Expected { system, messages, max_tokens?, provider? }.' });
        return;
      }

      res.writeHead(200, corsHeaders({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      }));
      // Disable Nagle's algorithm and flush headers immediately so SSE chunks
      // reach the browser without TCP-level batching delays.
      if (res.socket) res.socket.setNoDelay(true);
      res.flushHeaders();

      const sendSSE = (type, data) => {
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
      };

      const requestedProvider = body.provider || 'auto';
      const maxTokens = body.max_tokens || 8000;
      const imageTool = body.imageTool || 'generic';
      const videoTool = body.videoTool || 'generic';
      const length = body.length || '30-40 seconds';
      const schema = body.schema || 'generic';

      try {
        const provider = pickProvider(requestedProvider);
        sendSSE('provider', { id: provider.id, model: provider.model });

        if (provider.type === 'openai_chat_compatible') {
          let fullText = '';
          for await (const event of callOpenAICompatibleChatStream(provider, body.system, body.messages, Math.min(Number(maxTokens), 32000))) {
            if (event.chunk) {
              fullText += event.chunk;
              sendSSE('chunk', { text: event.chunk });
            }
            if (event.done) {
              fullText = event.fullText || fullText;
            }
          }
          // Check for empty content (reasoning models may burn all tokens on reasoning_content)
          if (!fullText || !fullText.trim()) {
            sendSSE('error', { message: 'Model produced no output content. The reasoning model may have used all tokens on internal reasoning — try increasing max_tokens or using a non-reasoning model.' });
            res.end();
            return;
          }

          let parsedPkg;
          try {
            parsedPkg = robustParseJSON(fullText);
          } catch (parseErr) {
            sendSSE('error', { message: 'JSON parse failed: ' + parseErr.message });
            res.end();
            return;
          }
          // Score but never reject — browser handles retry decisions
          if (schema !== 'wildlife') {
            const qa = scoreVideoPackage(parsedPkg, imageTool, videoTool, length);
            parsedPkg.qa = qa;
          }
          sendSSE('result', { content: parsedPkg });
        } else {
          // Non-streaming fallback for other provider types
          const result = await callModel({
            providerId: requestedProvider,
            system: body.system,
            messages: body.messages,
            max_tokens: maxTokens
          });

          const rawText = result.content[0]?.text || '';
          if (!rawText || !rawText.trim()) {
            sendSSE('error', { message: 'Model produced no output content. The reasoning model may have used all tokens on internal reasoning — try increasing max_tokens or using a non-reasoning model.' });
            res.end();
            return;
          }
          sendSSE('chunk', { text: rawText });

          let parsedPkg;
          try {
            parsedPkg = robustParseJSON(rawText);
          } catch (parseErr) {
            sendSSE('error', { message: 'JSON parse failed: ' + parseErr.message });
            res.end();
            return;
          }
          // Score but never reject — browser handles retry decisions
          if (schema !== 'wildlife') {
            const qa = scoreVideoPackage(parsedPkg, imageTool, videoTool, length);
            parsedPkg.qa = qa;
          }
          sendSSE('result', { content: parsedPkg });
        }
      } catch (err) {
        console.error(`[faceless-content-router] Stream error: ${err.message}`);
        sendSSE('error', { message: err.message || String(err) });
      }

      res.end();
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/messages') {
      const body = await readBody(req);
      if (!body.system || !Array.isArray(body.messages)) {
        sendJson(res, 400, { error: 'Expected { system, messages, max_tokens?, provider? }.' });
        return;
      }

      const requestedProvider = body.provider || 'auto';
      const max_tokens = body.max_tokens;
      const imageTool = body.imageTool || 'generic';
      const videoTool = body.videoTool || 'generic';
      const length = body.length || '30-40 seconds';
      const schema = body.schema || 'generic';

      let attempt = 0;
      const maxAttempts = 3;
      const QUALITY_RETRY_THRESHOLD = 70;
      let lastErrorMsg = '';
      let result;
      let parsedPkg;
      let qa = null;
      let ok = false;
      let rawText = '';
      let activeProviderId = requestedProvider;
      const triedProviders = new Set();
      const NETWORK_ERRORS = ['Failed to fetch', 'fetch failed', 'signal is aborted', 'timeout', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'];

      function isNetworkError(msg) {
        const lower = (msg || '').toLowerCase();
        return NETWORK_ERRORS.some((p) => lower.includes(p.toLowerCase()));
      }

      function allProviders() {
        return ['anthropic', 'nine_router', 'opencode_zen', 'opencode_go', 'openai', 'neuralwatt', 'custom_openai_compatible', 'codex_oauth']
          .filter((id) => providerRuntime(id)?.configured);
      }

      while (attempt < maxAttempts) {
        attempt++;
        console.error(`[faceless-content-router] Generation attempt ${attempt}/${maxAttempts} (provider: ${activeProviderId})...`);

        let activeSystemPrompt = body.system;
        if (attempt > 1 && lastErrorMsg && !lastErrorMsg.startsWith('- Generation or JSON parsing failed') && !lastErrorMsg.startsWith('- Previous provider failed')) {
          activeSystemPrompt = `${body.system}\n\nIMPORTANT: Your previous response needs correction:\n${lastErrorMsg}\n\nFix these specific issues, keep scene numbers aligned 1:1, and return ONLY a valid, parseable JSON block matching the requested schema.`;
        }

        try {
          result = await callModel({
            providerId: activeProviderId,
            system: activeSystemPrompt,
            messages: body.messages,
            max_tokens
          });

          rawText = result.content[0].text;
          parsedPkg = robustParseJSON(rawText);
          if (schema === 'wildlife') {
            // Wildlife schema — skip generic validation/scoring; generator has own QA
            console.error(`[faceless-content-router] Wildlife package parsed successfully on attempt ${attempt}`);
            ok = true;
            break;
          }

          const qaErrors = validateVideoPackage(parsedPkg, imageTool, videoTool, length);
          if (qaErrors.length > 0) {
            console.error(`[faceless-content-router] Hard validation failed on attempt ${attempt}:`, qaErrors);
            lastErrorMsg = qaErrors.map(e => `- ${e}`).join('\n');
            continue;
          }

          qa = scoreVideoPackage(parsedPkg, imageTool, videoTool, length);
          console.error(`[faceless-content-router] QA score on attempt ${attempt}: ${qa.overall}/100 (${qa.grade})`);

          if (qa.overall >= QUALITY_RETRY_THRESHOLD || attempt === maxAttempts) {
            ok = true;
            break;
          }
          lastErrorMsg = qa.flags.map(f => `- ${f}`).join('\n') || '- Overall quality score below target; strengthen weak categories.';
        } catch (err) {
          triedProviders.add(activeProviderId);
          console.error(`[faceless-content-router] Attempt ${attempt} failed: ${err.message}`);

          // Fallback: if auto and network error, try next provider
          if (requestedProvider === 'auto' && isNetworkError(err.message)) {
            const available = allProviders().filter((p) => !triedProviders.has(p));
            if (available.length > 0) {
              activeProviderId = available[0];
              console.error(`[faceless-content-router] Falling back to provider: ${activeProviderId}`);
              lastErrorMsg = `- Previous provider failed: ${err.message}. Switched to ${activeProviderId}.`;
              continue;
            }
          }

          try {
            const fs = await import('node:fs');
            fs.writeFileSync('raw_response.txt', rawText || '');
          } catch(e){}
          lastErrorMsg = `- Generation or JSON parsing failed: ${err.message}`;
        }
      }

      if (!ok || !parsedPkg) {
        const triedList = [...triedProviders].join(', ') || activeProviderId;
        sendJson(res, 422, {
          error: `Content generation failed after ${attempt} attempt(s) via provider(s): ${triedList}.`,
          details: lastErrorMsg
        });
        return;
      }

      if (schema === 'wildlife') {
        // Wildlife: return raw text as-is; generator handles its own parsing/scoring
        sendJson(res, 200, result);
        return;
      }

      if (!qa) qa = scoreVideoPackage(parsedPkg, imageTool, videoTool, length);
      parsedPkg.qa = qa;

      // Replace with clean JSON string
      result.content[0].text = JSON.stringify(parsedPkg, null, 2);
      sendJson(res, 200, result);
      return;
    }
    sendJson(res, 404, { error: 'Not found.' });
  } catch (err) {
    console.error(`[faceless-content-router] Error: ${err.stack || err.message || String(err)}`);
    sendJson(res, 500, { error: err.message || String(err) });
  }
});

server.listen(PORT, HOST, () => {
  console.error(`[faceless-content-router] Listening on http://${HOST}:${PORT}`);
  console.error(`[faceless-content-router] Open the UI at http://${HOST}:${PORT}/`);
  const status = listProviderStatus().filter((p) => p.id !== 'auto');
  console.error(`[faceless-content-router] Ready providers: ${status.filter((p) => p.configured).map((p) => `${p.id}:${p.model}`).join(', ') || 'none'}`);
  console.error(`[faceless-content-router] Skipped providers: ${status.filter((p) => !p.configured).map((p) => `${p.id} (${p.skipped})`).join(', ') || 'none'}`);
  console.error(`[faceless-content-router] Health check: http://${HOST}:${PORT}/health`);
});
