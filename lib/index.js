// dsh-claude-provider — host plugin
//
// A Settings -> Providers panel for Anthropic Claude Code.
//
// The OAuth work is NOT reimplemented here. `@deepseek-ai/dsh-llm-pi-ai`
// already registers an authorization flow for every pi-ai catalog provider it
// can sign in. For `anthropic` that flow is pi-ai's own Claude Pro/Max login:
// PKCE, a loopback callback server, the pasted-code fallback, the token
// exchange, and rotating refresh. This plugin is the missing surface.
//
// What it adds:
//   - a Remote gateway the browser can call (this file)
//   - a Providers settings section that drives it (lib/client.js)
//
// One subtlety shapes the design. `ctx.authorization.begin()` takes an
// interaction whose `prompt()` blocks until the human answers, but the browser
// that renders the question is a separate process across an RPC boundary that
// cannot carry callbacks. So `begin()` is started as a task, and the
// interaction it was given queues what the flow reports; the browser polls for
// that queue and posts answers back. Prompts are resolved out of order with any
// notice interleaved, which is exactly what the flow expects.

import { credentialKey } from "@deepseek-ai/dsh-credentials";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

const name = "claude-provider";
const inject = ["authorization", "credentials"];

/** The adapter family that owns pi-ai provider records; must match dsh-llm-pi-ai. */
const RECORD_SCOPE = "llm-pi-ai";
/** pi-ai's catalog provider id, which is also the harness route key. */
const PROVIDER_ID = "anthropic";

/** A prompt the browser has not answered yet, and the promise waiting on it. */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function friendlyError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

// ── Remote method markers ─────────────────────────────────────────────────
// Node has no decorator syntax, so the stage-3 initializer runs by hand, the
// same way dsh-codex-provider does it.
function makeRemoteMarker(methodName) {
  let initializer = null;
  Remote(methodName)(undefined, {
    private: false,
    static: false,
    name: methodName,
    addInitializer(cb) {
      initializer = cb;
    },
  });
  return initializer;
}

const REMOTE_METHODS = ["status", "loginStart", "loginPoll", "loginAnswer", "loginCancel", "logout"];

class ClaudeGateway extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, "claudeProvider");
    this.ctx = ctx;
    this.key = credentialKey(RECORD_SCOPE, PROVIDER_ID);
    // One attempt at a time; AuthorizationService refuses a second anyway.
    this.attempt = null;
    for (const marker of REMOTE_METHODS.map(makeRemoteMarker)) {
      marker?.call(this);
    }

    ctx.effect(() => async () => {
      this.cancelAttemptNow();
    }, "claude-provider: cancel a running sign-in on unload");
  }

  // ── attempt bookkeeping ────────────────────────────────────────────────

  /**
   * The running attempt's browser-facing state.
   *
   * `events` is append-only and carries what the flow said; `prompt` is the one
   * question awaiting an answer, or null. `nextEvent` lets the browser ask only
   * for what it has not seen.
   */
  snapshot() {
    const attempt = this.attempt;
    if (attempt === null) return { phase: "idle", events: [], prompt: null };
    return {
      phase: attempt.phase,
      error: attempt.error,
      outcome: attempt.outcome,
      method: attempt.method,
      events: attempt.events,
      prompt: attempt.prompt,
    };
  }

  cancelAttemptNow() {
    const attempt = this.attempt;
    if (attempt === null) return;
    attempt.abort.abort();
    // Settle the outstanding question so `prompt()` cannot hang the flow after
    // its signal fired; the flow observes the abort itself.
    if (attempt.pending !== null) {
      attempt.pending.reject(new Error("sign-in cancelled"));
      attempt.pending = null;
      attempt.prompt = null;
    }
  }

  // ── Remote surface ─────────────────────────────────────────────────────

  /** What the panel needs to render: sign-in readiness, the account, and any live attempt. */
  async status() {
    const authorization = this.ctx.authorization;
    let flow = null;
    try {
      flow = authorization.describe(this.key) ?? null;
    } catch {
      flow = null;
    }

    let record = null;
    try {
      record = await this.ctx.credentials.describeRecord(this.key);
    } catch {
      record = null;
    }

    let profile = null;
    if (record?.configured === true) {
      // The payload is pi-ai's own OAuth credential; read only the fields the
      // panel shows, never the token itself.
      const stored = await this.ctx.credentials.readRecord(this.key).catch(() => undefined);
      const payload = stored?.kind === "grant" ? stored.payload : undefined;
      if (payload && typeof payload === "object") {
        const expires = typeof payload.expires === "number" ? payload.expires : null;
        profile = {
          expiresAt: expires,
          expired: expires === null ? null : Date.now() >= expires,
        };
      }
    }

    return {
      ok: true,
      signedIn: record?.configured === true,
      credentialKind: record?.kind ?? null,
      recordWritable: record?.writable ?? false,
      // Which endpoint the sign-in hands the browser. Anthropic's current
      // entry point redirects to the address pi-ai opens, so this is shown
      // rather than used to replace the flow's own URL.
      authorizeEntry: "https://claude.com/cai/oauth/authorize",
      flow: flow === null
        ? null
        : {
            label: flow.label,
            methods: flow.methods.map((method) => ({ id: method.id, label: method.label })),
            inFlight: flow.inFlight,
          },
      profile,
      attempt: this.snapshot(),
    };
  }

  /**
   * Begin a sign-in attempt.
   * @param method - a method id from `status().flow.methods`; defaults to the flow's first.
   */
  async loginStart(method) {
    if (this.attempt !== null && this.attempt.phase === "running") {
      return { ok: true, attempt: this.snapshot() };
    }

    const flow = this.ctx.authorization.describe(this.key);
    if (flow === undefined) {
      return {
        ok: false,
        error:
          "no sign-in is available for anthropic: the llm-pi-ai adapter did not register one. Confirm @deepseek-ai/dsh-llm-pi-ai is mounted.",
      };
    }

    const chosen = typeof method === "string" && method.length > 0
      ? method
      : flow.methods[0]?.id;
    if (chosen === undefined) {
      return { ok: false, error: "the anthropic flow offers no sign-in method" };
    }

    const attempt = {
      phase: "running",
      error: null,
      outcome: null,
      method: chosen,
      abort: new AbortController(),
      events: [],
      prompt: null,
      pending: null,
      cursor: 0,
    };
    this.attempt = attempt;

    const notify = (notice) => {
      const event = {
        seq: attempt.cursor++,
        kind: "notice",
        message: String(notice?.message ?? ""),
        url: notice?.url,
        code: notice?.code,
      };
      attempt.events.push(event);
    };

    const prompt = (question) => {
      const request = {
        seq: attempt.cursor++,
        kind: "prompt",
        promptKind: question.kind,
        message: String(question.message ?? ""),
        placeholder: question.placeholder,
        options: question.kind === "select"
          ? question.options.map((option) => ({ id: option.id, label: option.label, description: option.description }))
          : undefined,
      };
      attempt.events.push({ seq: request.seq, kind: "awaiting-answer", message: request.message });
      const pending = deferred();
      attempt.pending = pending;
      attempt.prompt = request;
      // A prompt withdrawn by the flow (it lost a race with a browser callback)
      // must reject so the flow continues; the attempt itself keeps running.
      question.signal?.addEventListener("abort", () => {
        if (attempt.pending === pending) {
          attempt.pending = null;
          attempt.prompt = null;
        }
        pending.reject(new Error("prompt withdrawn"));
      }, { once: true });
      return pending.promise;
    };

    // Started, not awaited: `begin()` resolves only once the human is done.
    const run = (async () => {
      try {
        const outcome = await this.ctx.authorization.begin({
          key: this.key,
          method: chosen,
          signal: attempt.abort.signal,
          interaction: { notify, prompt },
        });
        attempt.outcome = outcome?.status ?? "cancelled";
        attempt.phase = attempt.outcome === "authorized" ? "done" : "idle";
      } catch (error) {
        // A cancellation is not a failure; anything else is worth showing.
        const message = friendlyError(error);
        if (attempt.abort.signal.aborted || /cancel/i.test(message)) {
          attempt.phase = "idle";
          attempt.outcome = "cancelled";
        } else {
          attempt.phase = "failed";
          attempt.error = message;
        }
      } finally {
        attempt.prompt = null;
        if (attempt.pending !== null) {
          attempt.pending.reject(new Error("sign-in finished"));
          attempt.pending = null;
        }
      }
    })();

    // Keep the task referenced so a failed attempt cannot surface as an
    // unhandled rejection once the browser stops polling.
    attempt.task = run;
    run.catch(() => {});

    return { ok: true, attempt: this.snapshot() };
  }

  /**
   * Read the attempt's progress.
   * @param since - the last event sequence the caller has already rendered.
   */
  async loginPoll(since) {
    const attempt = this.attempt;
    if (attempt === null) return { ok: true, attempt: this.snapshot(), events: [], done: true };
    const from = typeof since === "number" && Number.isFinite(since) ? since : -1;
    const events = attempt.events.filter((event) => event.seq > from);
    const done = attempt.phase !== "running";
    return { ok: true, attempt: this.snapshot(), events, done };
  }

  /**
   * Answer the outstanding prompt.
   * @param value - what the human typed, or the chosen option's id.
   */
  async loginAnswer(value) {
    const attempt = this.attempt;
    if (attempt === null || attempt.pending === null) {
      return { ok: false, error: "there is no question waiting for an answer" };
    }
    const pending = attempt.pending;
    attempt.pending = null;
    attempt.prompt = null;
    pending.resolve(typeof value === "string" ? value : "");
    return { ok: true, attempt: this.snapshot() };
  }

  /** Withdraw the running attempt. */
  async loginCancel() {
    this.cancelAttemptNow();
    const attempt = this.attempt;
    if (attempt !== null) {
      attempt.phase = "idle";
      attempt.outcome = "cancelled";
      attempt.prompt = null;
    }
    return { ok: true, attempt: this.snapshot() };
  }

  /** Remove the stored credential. */
  async logout() {
    try {
      await this.ctx.credentials.deleteRecord(this.key);
    } catch (error) {
      return { ok: false, error: friendlyError(error) };
    }
    return { ok: true };
  }
}

export { ClaudeGateway, ClaudeGateway as default, inject, name };
