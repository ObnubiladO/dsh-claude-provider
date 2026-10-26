# dsh-claude-provider

A **Settings → Providers** panel for Anthropic **Claude Code / Claude Pro / Max** in
DeepSeek Harness, so a Claude subscription can pay for inference instead of an API key.

## What this adds

DeepSeek Harness can already run Anthropic's OAuth login — `@deepseek-ai/dsh-llm-pi-ai`
registers an authorization flow for every pi-ai catalog provider it can sign in,
`anthropic` included. What it shipped without is a surface: nothing in the UI called
`ctx.authorization.begin()` for anything except the DeepSeek account.

This plugin is that surface. It renders a Providers section, lists the registered
Anthropic flow and its methods, runs an attempt, shows the authorization URL and any
code the flow reports, relays the flow's questions (login method, pasted code) to the
panel, and reports whether a credential is stored.

It does **not** reimplement OAuth. PKCE, the loopback callback server, the pasted-code
fallback, the token exchange, rotating refresh, and the Claude Code identity headers
(`anthropic-beta: claude-code-…`, `oauth-2025-04-20`, the `claude-cli/…` user agent)
all stay in pi-ai and the harness adapter, which means they keep getting fixed upstream.

## Install

```bash
dsh plugin --profile web add github:ObnubiladO/dsh-claude-provider
```

Restart DeepDive, then open **Settings → Providers**.

## Sign in

1. **Sign in with Claude** starts an attempt.
2. The panel shows the authorization URL — Anthropic's current entry point
   `https://claude.com/cai/oauth/authorize`, which redirects to `claude.ai/oauth/authorize`.
   Open it, approve, and finish in the browser.
3. If the browser cannot reach the local callback (remote machine, container), choose the
   pasted-code method and paste the code Claude shows.

The credential lands in the harness credential store as the `llm-pi-ai/anthropic` grant
record, which is exactly where the adapter looks, so no route configuration is needed.

## Requirements

- DeepSeek Harness / DeepDive with `@deepseek-ai/dsh-llm-pi-ai` and `@deepseek-ai/dsh-authorization` mounted
- Verified against `dsh 0.2.1-rc.3` (DeepDive 0.2.7)

## Files

| File | Role |
| --- | --- |
| `lib/index.js` | host plugin: a `TypertRemoteService` (`claudeProvider`) that bridges `ctx.authorization` to the browser |
| `lib/client.js` | client plugin: the Providers panel (`settings.section`) |

## License

MIT.