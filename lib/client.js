// dsh-claude-provider — client bundle (ModuleLoader format)
//
// Settings -> Providers entry for Anthropic Claude Code.
//
// It renders one panel and drives the host gateway in lib/index.js: list the
// authorization flow, start an attempt, show what the flow reports (the OAuth
// URL, any code to type), answer the questions it asks (login method, pasted
// code), and read the stored credential's state.
//
// Wire contract, learned from the gateway's own `prepareInvocation`:
//   - each parameter is { name, wire, source: "json", codec } with a codec
//     whose `mode` is "strict"; the codec's `create()` is only consulted by
//     surfaces that build JSON Schema, never by a direct call
//   - calls map positional arguments onto `wire` names, so the descriptor's
//     parameter order must match the host method signature
//   - a strict result is returned as-is unless it carries `decode`
window.__ModuleLoader__.load({
  id: "dsh-claude-provider",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");

    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useCallback = React.useCallback;

    const NS = "settings.claudeProvider";

    // ── Remote descriptors ────────────────────────────────────────────────
    function stringCodec(name) {
      return {
        mode: "strict",
        typeSymbol: `dsh-claude-provider#${name}`,
        create: () => ({ parse: (value) => value }),
        jsonSchema: { type: "string" },
      };
    }

    function parameter(name) {
      return { name, wire: name, source: "json", codec: stringCodec(name) };
    }

    function resultCodec(method) {
      return {
        mode: "strict",
        typeSymbol: `dsh-claude-provider#claudeProvider/${method}:result`,
        create: () => ({ parse: (value) => value }),
      };
    }

    const METHODS = [
      { method: "status", parameters: [] },
      { method: "loginStart", parameters: [parameter("method")] },
      { method: "loginPoll", parameters: [parameter("since")] },
      { method: "loginAnswer", parameters: [parameter("value")] },
      { method: "loginCancel", parameters: [] },
      { method: "logout", parameters: [] },
    ];

    const CLAUDE_REMOTE = Object.freeze({
      package: "dsh-claude-provider",
      descriptors: METHODS.map((entry) => ({
        id: `dsh-claude-provider#claudeProvider/${entry.method}`,
        service: "claudeProvider",
        namespace: "claudeProvider",
        method: entry.method,
        invocation: { kind: "direct" },
        parameters: entry.parameters,
        result: resultCodec(entry.method),
      })),
    });

    // ── Copy ─────────────────────────────────────────────────────────────
    const en = {
      nav: "Providers",
      title: "Anthropic Claude Code",
      subtitle: "Claude Pro / Max and Claude Code accounts, over OAuth.",
      accounts: "Accounts",
      signedIn: "Signed in",
      signedOut: "Not signed in",
      signIn: "Sign in with Claude",
      signOut: "Sign out",
      signOutConfirm: "Remove the stored Claude credentials?",
      waiting: "Waiting for authorization…",
      cancel: "Cancel",
      retry: "Try again",
      openAuth: "Open the authorization page",
      copy: "Copy",
      copied: "Copied",
      codePrompt: "Paste the code Claude showed you",
      continue: "Continue",
      expires: "Expires",
      expired: "Token expired",
      never: "Unknown",
      noFlow: "Sign-in is not available. The llm-pi-ai adapter did not register an Anthropic flow.",
      authorized: "Signed in. Claude models are now available in the model picker.",
      cancelled: "Sign-in cancelled.",
      failed: "Sign-in failed",
      loading: "Loading sign-in state…",
      statusFailed: "Could not read the sign-in state",
      entryHint: "Sign-in opens claude.com and returns to a local callback.",
    };

    const zh = {
      nav: "供应商",
      title: "Anthropic Claude Code",
      subtitle: "通过 OAuth 登录 Claude Pro / Max 或 Claude Code 账号。",
      accounts: "账号",
      signedIn: "已登录",
      signedOut: "未登录",
      signIn: "使用 Claude 账号登录",
      signOut: "退出登录",
      signOutConfirm: "确定移除已保存的 Claude 凭证？",
      waiting: "等待授权完成…",
      cancel: "取消",
      retry: "重试",
      openAuth: "打开授权页面",
      copy: "复制",
      copied: "已复制",
      codePrompt: "粘贴 Claude 显示的代码",
      continue: "继续",
      expires: "过期时间",
      expired: "令牌已过期",
      never: "未知",
      noFlow: "登录不可用：llm-pi-ai 适配器未注册 Anthropic 授权流程。",
      authorized: "已登录，Claude 模型现在可以在模型选择器中使用。",
      cancelled: "已取消登录。",
      failed: "登录失败",
      loading: "正在读取登录状态…",
      statusFailed: "无法读取登录状态",
      entryHint: "登录将在浏览器中打开 claude.com，并回调到本机端口。",
    };

    // ── Styling ──────────────────────────────────────────────────────────
    // Only design-system variables, so the panel follows the app theme.
    const S = {
      section: { display: "flex", flexDirection: "column", gap: 16, padding: "4px 0" },
      header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
      heading: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 },
      title: { fontSize: 15, fontWeight: 600, color: "var(--dsw-alias-label-primary)", margin: 0 },
      subtitle: { fontSize: 13, lineHeight: "20px", color: "var(--dsw-alias-label-secondary)", margin: 0 },
      card: {
        border: "1px solid var(--dsw-alias-border-l2)",
        borderRadius: 8,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: "var(--dsw-alias-bg-l1)",
      },
      row: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
      label: { fontSize: 12, color: "var(--dsw-alias-label-secondary)" },
      value: { fontSize: 13, color: "var(--dsw-alias-label-primary)" },
      badge: {
        fontSize: 12,
        lineHeight: "18px",
        padding: "1px 8px",
        borderRadius: 999,
        border: "1px solid var(--dsw-alias-border-l2)",
        color: "var(--dsw-alias-label-secondary)",
        whiteSpace: "nowrap",
      },
      primary: {
        fontSize: 13,
        lineHeight: "20px",
        padding: "6px 14px",
        borderRadius: 6,
        border: "1px solid transparent",
        background: "var(--dsw-alias-label-primary)",
        color: "var(--dsw-alias-bg-l1)",
        cursor: "pointer",
      },
      secondary: {
        fontSize: 13,
        lineHeight: "20px",
        padding: "6px 14px",
        borderRadius: 6,
        border: "1px solid var(--dsw-alias-border-l2)",
        background: "transparent",
        color: "var(--dsw-alias-label-primary)",
        cursor: "pointer",
      },
      input: {
        fontSize: 13,
        lineHeight: "20px",
        padding: "6px 10px",
        borderRadius: 6,
        border: "1px solid var(--dsw-alias-border-l2)",
        background: "var(--dsw-alias-bg-l1)",
        color: "var(--dsw-alias-label-primary)",
        width: "100%",
        boxSizing: "border-box",
        fontFamily: "inherit",
      },
      notice: { fontSize: 13, lineHeight: "20px", color: "var(--dsw-alias-label-secondary)" },
      error: { fontSize: 13, lineHeight: "20px", color: "var(--dsw-alias-state-error-primary)" },
      mono: {
        fontFamily: "var(--dsw-alias-font-mono, ui-monospace, monospace)",
        fontSize: 13,
        wordBreak: "break-all",
      },
      link: { color: "var(--dsw-alias-label-primary)", textDecoration: "underline", cursor: "pointer", wordBreak: "break-all" },
      url: {
        fontSize: 12,
        lineHeight: "18px",
        padding: 8,
        borderRadius: 6,
        border: "1px solid var(--dsw-alias-border-l2)",
        background: "var(--dsw-alias-bg-l2)",
        wordBreak: "break-all",
        maxHeight: 96,
        overflow: "auto",
      },
    };

    function remoteValue(response, fallback) {
      if (!response) throw new Error(fallback);
      if (!response.ok) {
        const message = response.error && (response.error.message || response.error.error);
        throw new Error(message || fallback);
      }
      const value = response.value;
      if (value && value.ok === false) throw new Error(value.error || fallback);
      return value;
    }

    function formatTime(ts, t) {
      if (typeof ts !== "number" || !Number.isFinite(ts)) return t("never");
      try {
        return new Date(ts).toLocaleString();
      } catch {
        return t("never");
      }
    }

    // ── One question the flow is waiting on ───────────────────────────────
    function PromptCard({ prompt, answer, onAnswer, t }) {
      const [text, setText] = useState("");
      const isSelect = prompt.promptKind === "select";

      useEffect(() => {
        setText("");
      }, [prompt.seq]);

      function submit(event) {
        event.preventDefault();
        const value = text.trim();
        if (value.length === 0) return;
        onAnswer(value);
      }

      return h(
        "form",
        { onSubmit: submit, style: { display: "flex", flexDirection: "column", gap: 8 } },
        h("div", { style: S.notice }, prompt.message),
        isSelect
          ? h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: 6 } },
              (prompt.options || []).map((option) =>
                h(
                  "button",
                  {
                    key: option.id,
                    type: "button",
                    style: S.secondary,
                    disabled: answer,
                    onClick: () => onAnswer(option.id),
                    title: option.description,
                  },
                  option.label
                )
              )
            )
          : h(
              "div",
              { style: { display: "flex", gap: 8, alignItems: "center" } },
              h("input", {
                style: S.input,
                value: text,
                placeholder: prompt.placeholder || t("codePrompt"),
                onChange: (event) => setText(event.target.value),
                autoFocus: true,
                spellCheck: false,
                disabled: answer,
              }),
              h(
                "button",
                { type: "submit", style: S.primary, disabled: answer || text.trim().length === 0 },
                t("continue")
              )
            ),
        prompt.promptKind === "secret"
          ? h("div", { style: S.label }, "This value is stored only as a credential and is never shown again.")
          : null
      );
    }

    // ── Provider section ─────────────────────────────────────────────────
    function ClaudeProviderSection({ t, api }) {
      const [status, setStatus] = useState(null);
      const [attempt, setAttempt] = useState(null);
      const [events, setEvents] = useState([]);
      const [prompt, setPrompt] = useState(null);
      const [busy, setBusy] = useState(false);
      const [answer, setAnswer] = useState(false);
      const [notice, setNotice] = useState(null);
      const [failed, setFailed] = useState(false);
      const [copied, setCopied] = useState(false);
      const seqRef = React.useRef(-1);

      const refresh = useCallback(async () => {
        try {
          const value = remoteValue(await api.status(), "status failed");
          setStatus(value);
          setFailed(false);
          setAttempt(value.attempt || null);
          setPrompt(value.attempt && value.attempt.prompt ? value.attempt.prompt : null);
          if (value.attempt && Array.isArray(value.attempt.events)) {
            const fresh = value.attempt.events.filter((event) => event.seq > seqRef.current);
            if (fresh.length > 0) {
              seqRef.current = fresh[fresh.length - 1].seq;
              setEvents((previous) => previous.concat(fresh));
            }
          }
        } catch (error) {
          // Keep the failure visible. Hiding it behind a loading state is what
          // once turned a broken call into an endless "Waiting…".
          globalThis.console?.error?.("dsh-claude-provider: status failed", error);
          setNotice(String((error && error.message) || error));
          setFailed(true);
        }
      }, [api]);

      useEffect(() => {
        refresh();
      }, [refresh]);

      // Poll while an attempt is running. The attempt lives on the host, so a
      // reloaded page re-adopts it through `status()`.
      useEffect(() => {
        const running = attempt && attempt.phase === "running";
        if (!running) return undefined;
        let cancelled = false;
        let timer;
        const tick = async () => {
          try {
            const value = remoteValue(await api.loginPoll(seqRef.current), "loginPoll failed");
            if (cancelled) return;
            if (Array.isArray(value.events) && value.events.length > 0) {
              seqRef.current = value.events[value.events.length - 1].seq;
              setEvents((previous) => previous.concat(value.events));
            }
            if (value.attempt) {
              setAttempt(value.attempt);
              setPrompt(value.attempt.prompt || null);
            }
            if (value.done) {
              setBusy(false);
              setAnswer(false);
              await refresh();
              return;
            }
          } catch (error) {
            if (cancelled) return;
            setNotice(String((error && error.message) || error));
          }
          timer = setTimeout(tick, 700);
        };
        timer = setTimeout(tick, 400);
        return () => {
          cancelled = true;
          clearTimeout(timer);
        };
      }, [attempt, api, refresh]);

      const start = useCallback(async () => {
        setNotice(null);
        setEvents([]);
        setCopied(false);
        seqRef.current = -1;
        setBusy(true);
        setAnswer(false);
        try {
          // The method must be named explicitly: the descriptor declares one
          // parameter, and the transport refuses a call whose argument count
          // does not match it.
          const method = status && status.flow && status.flow.methods.length > 0
            ? status.flow.methods[0].id
            : "oauth";
          const value = remoteValue(await api.loginStart(method), "loginStart failed");
          setAttempt(value.attempt || null);
          setPrompt(value.attempt && value.attempt.prompt ? value.attempt.prompt : null);
        } catch (error) {
          setBusy(false);
          setNotice(String((error && error.message) || error));
        }
      }, [api, status]);

      const answerPrompt = useCallback(
        async (value) => {
          setAnswer(true);
          try {
            const result = remoteValue(await api.loginAnswer(value), "loginAnswer failed");
            setAttempt(result.attempt || attempt);
            setPrompt(null);
          } catch (error) {
            setNotice(String((error && error.message) || error));
          } finally {
            setAnswer(false);
          }
        },
        [api, attempt]
      );

      const cancel = useCallback(async () => {
        try {
          const value = remoteValue(await api.loginCancel(), "loginCancel failed");
          setAttempt(value.attempt || null);
          setPrompt(null);
          setBusy(false);
          setNotice(t("cancelled"));
        } catch (error) {
          setNotice(String((error && error.message) || error));
        }
        await refresh();
      }, [api, refresh, t]);

      const signOut = useCallback(async () => {
        if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(t("signOutConfirm"))) {
          return;
        }
        try {
          await api.logout();
          setAttempt(null);
          setPrompt(null);
          setEvents([]);
          seqRef.current = -1;
          await refresh();
        } catch (error) {
          setNotice(String((error && error.message) || error));
        }
      }, [api, refresh, t]);

      const copy = useCallback(async (text) => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard unavailable; the URL is still selectable */
        }
      }, []);

      if (status === null) {
        // Never hide why there is nothing to show: the section keeps its
        // heading, says it is still loading, and surfaces any failure with a
        // way to retry instead of sitting on a bare "Waiting…".
        return h(
          "div",
          { style: S.section },
          h(
            "div",
            { style: S.header },
            h(
              "div",
              { style: S.heading },
              h("h3", { style: S.title }, t("title")),
              h("p", { style: S.subtitle }, t("subtitle"))
            ),
            h("span", { style: S.badge }, t("signedOut"))
          ),
          h(
            "div",
            { style: S.card },
            failed
              ? h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: 10 } },
                  h("div", { style: S.error }, t("statusFailed")),
                  h("div", { style: S.mono }, notice || ""),
                  h(
                    "button",
                    {
                      type: "button",
                      style: S.secondary,
                      onClick: () => {
                        setNotice(null);
                        setFailed(false);
                        refresh();
                      },
                    },
                    t("retry")
                  )
                )
              : h("div", { style: S.notice }, t("loading"))
          )
        );
      }

      const running = attempt && attempt.phase === "running";
      const signedIn = status.signedIn === true;
      const flow = status.flow;
      const authUrl = events.filter((event) => event.kind === "notice" && event.url).map((event) => event.url);
      const lastUrl = authUrl.length > 0 ? authUrl[authUrl.length - 1] : null;
      const codeHints = events.filter((event) => event.kind === "notice" && event.code);
      const lastCode = codeHints.length > 0 ? codeHints[codeHints.length - 1].code : null;

      return h(
        "div",
        { style: S.section },
        h(
          "div",
          { style: S.header },
          h(
            "div",
            { style: S.heading },
            h("h3", { style: S.title }, t("title")),
            h("p", { style: S.subtitle }, t("subtitle"))
          ),
          h("span", { style: S.badge }, signedIn ? t("signedIn") : t("signedOut"))
        ),

        notice ? h("div", { style: S.error }, notice) : null,

        h(
          "div",
          { style: S.card },
          signedIn
            ? h(
                "div",
                { style: S.row },
                h("span", { style: S.label }, t("expires")),
                h(
                  "span",
                  { style: S.value },
                  status.profile && status.profile.expired
                    ? t("expired")
                    : formatTime(status.profile ? status.profile.expiresAt : null, t)
                ),
                h("span", { style: { flex: 1 } }),
                h(
                  "button",
                  { type: "button", style: S.secondary, onClick: signOut, disabled: running },
                  t("signOut")
                )
              )
            : h(
                "div",
                { style: S.row },
                h("span", { style: S.value }, flow ? flow.label : t("noFlow")),
                h("span", { style: { flex: 1 } }),
                h(
                  "button",
                  {
                    type: "button",
                    style: S.primary,
                    onClick: start,
                    disabled: running || busy || flow === null,
                  },
                  running ? t("waiting") : t("signIn")
                )
              ),

          flow === null ? h("div", { style: S.error }, t("noFlow")) : null,

          h("div", { style: S.label }, t("entryHint")),

          running
            ? h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: 10 } },
                lastUrl
                  ? h(
                      "div",
                      { style: { display: "flex", flexDirection: "column", gap: 6 } },
                      h("div", { style: S.notice }, t("openAuth")),
                      h("div", { style: S.url }, lastUrl),
                      h(
                        "div",
                        { style: S.row },
                        h(
                          "a",
                          {
                            href: lastUrl,
                            target: "_blank",
                            rel: "noreferrer noopener",
                            style: Object.assign({}, S.secondary, S.link, { textDecoration: "none" }),
                          },
                          t("openAuth")
                        ),
                        h(
                          "button",
                          { type: "button", style: S.secondary, onClick: () => copy(lastUrl) },
                          copied ? t("copied") : t("copy")
                        )
                      )
                    )
                  : h("div", { style: S.notice }, t("waiting")),

                lastCode
                  ? h(
                      "div",
                      { style: S.row },
                      h("span", { style: S.label }, "Code"),
                      h("code", { style: S.mono }, lastCode)
                    )
                  : null,

                prompt
                  ? h(PromptCard, { prompt, answer, onAnswer: answerPrompt, t })
                  : h("div", { style: S.notice }, t("waiting")),

                h(
                  "div",
                  { style: S.row },
                  h("button", { type: "button", style: S.secondary, onClick: cancel }, t("cancel"))
                )
              )
            : null,

          !running && attempt && attempt.phase === "done"
            ? h("div", { style: S.notice }, t("authorized"))
            : null,

          !running && attempt && attempt.phase === "failed"
            ? h(
                "div",
                { style: S.error },
                (attempt.error ? t("failed") + ": " + attempt.error : t("failed")),
                attempt.error
                  ? h(
                      "div",
                      null,
                      h(
                        "button",
                        { type: "button", style: S.secondary, onClick: start, disabled: busy },
                        t("retry")
                      )
                    )
                  : null
              )
            : null
        )
      );
    }

    // ── Plugin entry ─────────────────────────────────────────────────────
    async function apply(ctx) {
      const { slots, locale, remote } = ctx;
      const disposeRemote = await remote.$mount(CLAUDE_REMOTE);
      ctx.effect(() => locale.register(NS, { zh, en }), "claude-provider-ui: dictionaries");
      const t = locale.bind(NS);
      ctx.inject(["remote.claudeProvider"], (scope) => {
        const injected = () => ({ api: scope.remote.claudeProvider });
        scope.slots.inject("settings.section", () =>
          scope.slots.register(
            {
              name: "settings.section",
              id: "claude-provider",
              order: 15,
              label: () => t("nav"),
              locale: NS,
              inject: injected,
            },
            ClaudeProviderSection
          )
        );
      });
      return disposeRemote;
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale", "remote"];
    return module.exports;
  },
});
