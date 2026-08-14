// dsh-plugin-claude-import — client half (browser).
// Top-right "Claude 导入" action in the conversation header. Clicking it opens
// a panel: type a Claude Code session id prefix (or leave empty = most recent)
// and hit 导入 — the plugin creates a NEW DSH session (same cwd), opens it,
// and delivers the import instruction into it; the new session's own agent
// imports the Claude context via claude_session_list / claude_session_import.

window.__ModuleLoader__.load({
  id: "dsh-plugin-claude-import",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
    var primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    var IconFolderOpen = primitives.IconFolderOpenOutline16;

    var NS = "dsh-plugin-claude-import";

    // Set by apply(); lets the components reach ctx without slot inject props
    // (conversation.session.header.actions renders with empty props).
    var _ctx = null;

    function importPromptText(query) {
      return (
        "请从 Claude Code 导入会话" +
        (query ? " " + query : "(最近一个)") +
        ":\n1. 先调用 claude_session_list 查看历史会话,确认目标会话 ID(已指定则跳过);\n" +
        "2. 再调用 claude_session_import 导入(sessionId=..., format=seed, createSession=true),在 Claude 会话所属项目目录下新建 DSH 会话;\n" +
        "3. 导入完成后告知新会话的 ID、项目目录,以及 Claude 会话的标题、动过的文件和可能的未完成事项。"
      );
    }

    /** Poll the session list until a session that did not exist before appears. */
    function pollNewSession(knownIds, timeoutMs, onFound, onTimeout) {
      var start = Date.now();
      var timer = setInterval(function () {
        var list = _ctx.sessions.list.getSnapshot();
        var ids = list.ids || Object.keys(list.byId || {});
        for (var i = 0; i < ids.length; i++) {
          if (!knownIds.has(ids[i])) {
            clearInterval(timer);
            onFound(ids[i]);
            return;
          }
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          onTimeout();
        }
      }, 500);
    }

    /**
     * Request a project-scoped import: tell the current session's agent to run
     * claude_session_import with createSession=true (the host tool creates the
     * new DSH session in the Claude project directory and delivers the context),
     * then poll the session list and open the new session when it appears.
     */
    async function doImport(query) {
      var sessions = _ctx.sessions;
      var knownIds = new Set();
      try {
        var snap = sessions.list.getSnapshot();
        (snap.ids || []).forEach(function (id) {
          knownIds.add(id);
        });
      } catch (e) {
        // empty baseline; poll everything as new
      }
      var currentId;
      try {
        currentId = sessions.list.getSnapshot().current;
      } catch (e) {
        currentId = void 0;
      }
      var actx = currentId === void 0 ? void 0 : sessions.scope(currentId);
      var conversation = actx === void 0 ? void 0 : actx.get("conversation");
      if (!conversation) {
        return { ok: false, error: { code: "no-conversation", message: "当前会话的 conversation 服务不可用", details: {} } };
      }
      try {
        await conversation.send(importPromptText(query));
      } catch (e) {
        return { ok: false, error: { code: "send-failed", message: "指令投递失败:" + (e && e.message ? e.message : String(e)), details: {} } };
      }
      // wait for the host-created session to appear, then open it
      return await new Promise(function (resolve) {
        pollNewSession(knownIds, 30000, function (newId) {
          try {
            sessions.open(newId);
          } catch (e) {
            // ignore open failures; the session is still listed
          }
          resolve({ ok: true, value: { sessionId: newId, delivered: true } });
        }, function () {
          resolve({ ok: true, value: { sessionId: null, delivered: false } });
        });
      });
    }

    // ── top-right action button (matches Session log's sessionLogButton) ──
    var actionStyle = {
      border: "1px solid var(--dsw-alias-border-l2)",
      minWidth: 111,
      height: 32,
      color: "var(--dsw-alias-label-primary)",
      fontFamily: "var(--dsw-font-family)",
      cursor: "pointer",
      background: "0 0",
      borderRadius: 18,
      justifyContent: "center",
      alignItems: "center",
      gap: 4,
      padding: "6px 12px",
      fontSize: 13,
      fontWeight: 400,
      lineHeight: "20px",
      display: "inline-flex",
      whiteSpace: "nowrap",
    };

    var anchorStyle = {
      position: "relative",
      display: "inline-flex",
    };

    // ── panel ─────────────────────────────────────────────────────────────
    var panelStyle = {
      position: "absolute",
      right: 0,
      top: "calc(100% + 8px)",
      width: 460,
      boxSizing: "border-box",
      background: "var(--dsw-specific-menu, var(--dsw-alias-bg-base))",
      border: "1px solid var(--dsw-alias-border-l2)",
      borderRadius: 12,
      boxShadow: "var(--dsw-shadow-lv3)",
      padding: "14px",
      zIndex: 100,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      fontSize: 13,
      lineHeight: "20px",
      color: "var(--dsw-alias-label-primary)",
    };

    var panelTitleStyle = {
      fontSize: 14,
      fontWeight: 600,
      color: "var(--dsw-alias-label-primary)",
    };

    // Full-width input: text is never ellipsized, scrolls horizontally only
    // when genuinely longer than the panel — every character stays visible.
    var inputStyle = {
      boxSizing: "border-box",
      width: "100%",
      height: 34,
      borderRadius: 8,
      border: "1px solid var(--dsw-alias-border-l2)",
      background: "var(--dsw-alias-bg-base)",
      color: "var(--dsw-alias-label-primary)",
      padding: "0 10px",
      outline: "none",
      fontSize: 13,
      fontFamily: "inherit",
    };

    var hintStyle = {
      color: "var(--dsw-alias-label-caption)",
      fontSize: 12,
      lineHeight: "18px",
      whiteSpace: "normal",
    };

    var statusStyle = {
      fontSize: 12,
      lineHeight: "18px",
      whiteSpace: "normal",
      wordBreak: "break-all",
    };

    var rowStyle = {
      display: "flex",
      alignItems: "center",
      gap: 8,
      justifyContent: "flex-end",
    };

    var primaryBtnStyle = {
      height: 28,
      borderRadius: 999,
      border: "none",
      cursor: "pointer",
      background: "var(--dsw-alias-button-info-fill)",
      color: "#fff",
      padding: "0 14px",
      fontSize: 13,
      fontWeight: 500,
    };

    var ghostBtnStyle = {
      height: 28,
      borderRadius: 999,
      border: "1px solid var(--dsw-alias-border-l2)",
      cursor: "pointer",
      background: "transparent",
      color: "var(--dsw-alias-label-secondary)",
      padding: "0 12px",
      fontSize: 13,
    };

    function ClaudeImportPanel(props) {
      var onClose = props.onClose;
      var useState = React.useState;
      var useRef = React.useRef;
      var [query, setQuery] = useState("");
      var [pending, setPending] = useState(false);
      var [status, setStatus] = useState(null); // null | {ok: boolean, text: string}
      var pendingRef = useRef(false);

      function handleImport() {
        if (pendingRef.current) return;
        pendingRef.current = true;
        setPending(true);
        setStatus(null);
        Promise.resolve(doImport(query.trim()))
          .then(function (result) {
            if (result && result.ok) {
              var shortId =
                result.value && result.value.sessionId
                  ? String(result.value.sessionId).slice(0, 8)
                  : "";
              if (result.value && result.value.delivered) {
                setStatus({ ok: true, text: "已创建新会话 " + shortId + " 并投递上下文,正在导入…" });
              } else {
                setStatus({
                  ok: false,
                  text: "等待新会话超时(30 秒)。agent 应已在对话中汇报新会话 ID,请从会话列表手动切换;若 agent 报错,请把错误信息发我。",
                });
              }
            } else {
              var msg = result && result.error ? result.error.message : "未知错误";
              setStatus({ ok: false, text: "导入失败:" + msg });
            }
          })
          .catch(function (err) {
            setStatus({ ok: false, text: "导入失败:" + (err && err.message ? err.message : String(err)) });
          })
          .finally(function () {
            pendingRef.current = false;
            setPending(false);
          });
      }

      return React.createElement(
        "div",
        { style: panelStyle },
        React.createElement("div", { style: panelTitleStyle }, "从 Claude Code 导入会话"),
        React.createElement(
          "input",
          {
            style: inputStyle,
            value: query,
            placeholder: "会话 ID(8 位前缀或完整 ID,留空 = 最近一个)",
            disabled: pending,
            autoFocus: true,
            onChange: function (e) {
              setQuery(e.target.value);
              setStatus(null);
            },
            onKeyDown: function (e) {
              if (e.key === "Enter") handleImport();
              if (e.key === "Escape") onClose();
            },
          }
        ),
        React.createElement(
          "div",
          { style: hintStyle },
          "将新建一个 DSH 会话(沿用当前项目目录)并自动切换过去,把 Claude 会话的续接上下文作为开场导入;新会话的 agent 会汇报标题、动过的文件与未完成事项。"
        ),
        status &&
          React.createElement(
            "div",
            {
              style: Object.assign({}, statusStyle, {
                color: status.ok ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-state-error-primary)",
              }),
            },
            status.text
          ),
        React.createElement(
          "div",
          { style: rowStyle },
          React.createElement("button", { style: ghostBtnStyle, disabled: pending, onClick: onClose }, "取消"),
          React.createElement("button", { style: primaryBtnStyle, disabled: pending, onClick: handleImport }, pending ? "导入中…" : "导入")
        )
      );
    }

    function ClaudeImportAction() {
      var useState = React.useState;
      var [open, setOpen] = useState(false);
      // flex-basis:100% inside a wrap-enabled utilities row forces this item
      // onto its own second line, right-aligned — directly below the
      // "Session log" button in the top-right corner.
      return React.createElement(
        "div",
        {
          "data-claude-import": "true",
          style: { flexBasis: "100%", display: "flex", justifyContent: "flex-end" },
        },
        React.createElement(
          "div",
          { style: anchorStyle },
          React.createElement(
            "button",
            {
              type: "button",
              style: Object.assign({}, actionStyle, open ? { background: "var(--dsw-alias-interactive-bg-hover)" } : {}),
              onClick: function () {
                setOpen(!open);
              },
              title: "从 Claude Code 导入会话到新 DSH 会话",
            },
            React.createElement("span", null, "Claude 导入"),
            React.createElement(IconFolderOpen, { size: 12 })
          ),
          open &&
            React.createElement(ClaudeImportPanel, {
              onClose: function () {
                setOpen(false);
              },
            })
        )
      );
    }

    function apply(ctx) {
      _ctx = ctx;
      if (!ctx.slots || !ctx.sessions) return;
      // Make the header utilities row wrap so this plugin can sit on a second
      // line below the Session log button (scoped to the stable class suffix).
      try {
        var tagId = "dsh-plugin-claude-import/header-wrap";
        if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
          var tag = document.createElement("style");
          tag.dataset.plugin = "dsh-plugin-claude-import";
          tag.dataset.pluginCss = tagId;
          tag.textContent =
            '[class*="_headerUtilities"]{flex-wrap:wrap;row-gap:4px;justify-content:flex-end}' +
            '[class*="_headerUtilities"]>[data-claude-import]{min-width:0}';
          document.head.appendChild(tag);
        }
      } catch (e) {
        // style injection is best-effort; the button still renders inline
      }
      ctx.slots.inject("conversation.session.header.utilities", function () {
        return ctx.slots.register({
          name: "conversation.session.header.utilities",
          id: "claude-import",
          order: 10,
          locale: NS,
        }, ClaudeImportAction);
      });
    }

    exports.ClaudeImportAction = ClaudeImportAction;
    exports.ClaudeImportPanel = ClaudeImportPanel;
    exports.inject = ["slots", "sessions"];
    exports.apply = apply;
    return module.exports;
  },
});
