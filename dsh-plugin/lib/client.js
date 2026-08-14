// dsh-plugin-claude-import — client half (browser).
// Renders a compact "Claude 导入" dock above the composer: type a session id
// prefix (or leave empty for the most recent one) and hit import — the click
// queues a prompt to the current session, and the agent tools
// (claude_session_list / claude_session_import) do the rest.

window.__ModuleLoader__.load({
  id: "dsh-plugin-claude-import",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");

    var NS = "dsh-plugin-claude-import";

    var dockStyle = {
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      gap: 8,
      height: 32,
      margin: "0 auto",
      maxWidth: "calc(var(--dsh-composer-card-max-width) - 32px)",
      padding: "0 10px",
      fontSize: 13,
      lineHeight: "20px",
    };

    var inputStyle = {
      minWidth: 0,
      flex: 1,
      maxWidth: 180,
      height: 26,
      borderRadius: 6,
      border: "1px solid var(--dsw-alias-border-l2)",
      background: "var(--dsw-alias-bg-base)",
      color: "var(--dsw-alias-label-primary)",
      padding: "0 8px",
      outline: "none",
      fontSize: 13,
    };

    var buttonStyle = {
      flex: "none",
      height: 26,
      borderRadius: 999,
      border: "none",
      cursor: "pointer",
      background: "var(--dsw-alias-button-info-fill)",
      color: "#fff",
      padding: "0 12px",
      fontSize: 13,
      fontWeight: 500,
    };

    var hintStyle = {
      flex: "none",
      color: "var(--dsw-alias-label-caption)",
      fontSize: 12,
      whiteSpace: "nowrap",
    };

    function ClaudeImportDock(props) {
      var onImport = props.onImport;
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
        Promise.resolve(onImport(query.trim()))
          .then((result) => {
            if (result && result.ok) {
              var shortId = result.value && result.value.sessionId ? String(result.value.sessionId).slice(0, 8) : "";
              if (result.value && result.value.delivered) {
                setStatus({ ok: true, text: "已创建新会话 " + shortId + " 并投递导入指令" });
              } else {
                setStatus({ ok: false, text: "已创建新会话 " + shortId + ",但指令投递失败——请在新会话输入框发送:从 Claude Code 导入会话" + (query.trim() ? " " + query.trim() : "(最近一个)") });
              }
            } else {
              var msg = result && result.error ? result.error.message : "未知错误";
              setStatus({ ok: false, text: "导入失败:" + msg });
            }
          })
          .catch((err) => setStatus({ ok: false, text: "导入失败:" + (err && err.message ? err.message : String(err)) }))
          .finally(() => {
            pendingRef.current = false;
            setPending(false);
          });
      }

      return React.createElement(
        "div",
        { style: dockStyle },
        React.createElement(
          "input",
          {
            style: inputStyle,
            value: query,
            placeholder: "Claude 会话 ID(留空 = 最近一个)",
            disabled: pending,
            onChange: function (e) {
              setQuery(e.target.value);
              setStatus(null);
            },
            onKeyDown: function (e) {
              if (e.key === "Enter") handleImport();
            },
          }
        ),
        React.createElement(
          "button",
          { style: buttonStyle, disabled: pending, onClick: handleImport },
          pending ? "导入中…" : "Claude 导入"
        ),
        status
          ? React.createElement("span", { style: hintStyle }, status.text)
          : React.createElement("span", { style: hintStyle }, "将 Claude Code 会话接入本会话")
      );
    }

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

    function apply(ctx) {
      if (!ctx.slots || !ctx.sessions) return;
      ctx.slots.inject("conversation.input.dock", function () {
        return ctx.slots.register({
          name: "conversation.input.dock",
          id: "claude-import",
          order: 20,
          locale: NS,
          inject: function (sessionId) {
            var sessions = ctx.sessions;
            return {
              onImport: async function (query) {
                // 1. current session's cwd becomes the new session's project dir
                var cwd;
                try {
                  var binding = sessions.binding(sessionId);
                  cwd = binding && binding.session ? binding.session.header.cwd : void 0;
                } catch (e) {
                  cwd = void 0;
                }
                // 2. create a NEW DSH session (blank), then open it
                var createResult = await sessions.create(cwd === void 0 ? {} : { cwd: cwd });
                if (!createResult || !createResult.ok) {
                  var msg = createResult && createResult.error ? createResult.error.message : "未知错误";
                  return { ok: false, error: { code: "session-create-failed", message: "创建新会话失败:" + msg, details: {} } };
                }
                var newId = createResult.value.sessionId;
                sessions.open(newId);
                // 3. deliver the import instruction into the new session
                var delivered = await deliverToSession(sessions, newId, importPromptText(query), 12);
                return {
                  ok: true,
                  value: { sessionId: newId, delivered: delivered },
                };
              },
            };
          },
        }, ClaudeImportDock);
      });
    }

    exports.ClaudeImportDock = ClaudeImportDock;
    exports.inject = ["slots", "sessions"];
    exports.apply = apply;
    return module.exports;
  },
});
