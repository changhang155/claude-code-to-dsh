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
        "2. 再调用 claude_session_import 导入(sessionId=..., format=seed);\n" +
        "3. 把返回的续接上下文纳入本会话工作背景,并汇报:会话标题、项目、动过的文件、可能的未完成事项。"
      );
    }

    /** Try to deliver text into a session via its conversation service. */
    async function deliverToSession(sessions, id, text, attempts) {
      for (var i = 0; i < attempts; i++) {
        try {
          var actx = sessions.scope(id);
          if (actx !== void 0) {
            var conversation = actx.get("conversation");
            if (conversation !== void 0) {
              await conversation.send(text);
              return true;
            }
          }
        } catch (e) {
          // session not attached yet — retry below
        }
        await new Promise(function (resolve) {
          setTimeout(resolve, 400);
        });
      }
      return false;
    }

    /** Create a new blank DSH session (same workspace), open it, deliver the instruction. */
    async function doImport(query) {
      var sessions = _ctx.sessions;
      var workspaces = _ctx.workspaces;
      var newId;
      try {
        // Official New Session flow: connectWorkspace returns the blank session id.
        var wsList = workspaces.list.getSnapshot();
        var wsId = wsList.recentWorkspaceId;
        if (wsId === void 0 && wsList.items && wsList.items.length > 0) {
          wsId = wsList.items[0].workspaceId;
        }
        if (wsId === void 0) {
          return { ok: false, error: { code: "no-workspace", message: "没有可用的工作区,请先打开一个会话再导入", details: {} } };
        }
        newId = await workspaces.connectWorkspace(wsId);
      } catch (e) {
        var msg = e && e.message ? e.message : String(e);
        return { ok: false, error: { code: "session-create-failed", message: "创建新会话失败:" + msg, details: {} } };
      }
      sessions.open(newId);
      // deliver the import instruction into the new session
      var delivered = await deliverToSession(sessions, newId, importPromptText(query), 12);
      return { ok: true, value: { sessionId: newId, delivered: delivered } };
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
                setStatus({ ok: true, text: "已创建新会话 " + shortId + " 并投递导入指令,正在导入…" });
              } else {
                setStatus({
                  ok: false,
                  text:
                    "已创建新会话 " + shortId + ",但指令投递失败。请在新会话输入框发送:从 Claude Code 导入会话" +
                    (query.trim() ? " " + query.trim() : "(最近一个)"),
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
    exports.inject = ["slots", "sessions", "workspaces"];
    exports.apply = apply;
    return module.exports;
  },
});
