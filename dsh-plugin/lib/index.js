// dsh-plugin-claude-import — host half.
// Registers two agent tools that read Claude Code sessions (~/.claude/projects)
// on the DSH host process and render continuable context (seed block or
// markdown continuation doc) that the agent can adopt as working context.

import { defineTool } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
import {
  defaultProjectsRoot,
  listSessionFiles,
  parseSession,
  resolveSessionFile,
} from "./parse.js";

const name = "claude-import";
const inject = ["tools", "apiProxy"];

const Config = z.object({});

function fmtSize(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u++;
  }
  return `${u === 0 ? n : n.toFixed(1)} ${units[u]}`;
}

function fmtTime(ts) {
  if (!ts) return "?";
  const d = new Date(ts * 1000);
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function sessionSummary(info) {
  return {
    id: info.id.slice(0, 8),
    project: info.projectDir,
    title: info.title,
    mtime: Math.floor(info.mtimeMs),
    sizeBytes: info.sizeBytes,
    userMessages: info.userMessages,
    assistantMessages: info.assistantMessages,
    toolCalls: info.toolCalls,
    errorResults: info.errorResults,
    localCommandMode: info.localCommandMode,
  };
}

function renderSeed(info) {
  const L = [];
  L.push(`【来自 Claude Code 会话 ${info.id.slice(0, 8)} 的续接上下文】`);
  L.push(`项目:${info.projectDir}`);
  L.push(`时间:${fmtTime(info.firstTs)} → ${fmtTime(info.lastTs)}`);
  if (info.localCommandMode) L.push("⚠️ 本地命令模式会话(消息多为命令注入)");
  L.push("");
  L.push("## 主题");
  L.push(info.title);
  L.push("");
  if (info.summaries.length) {
    L.push("## 上下文链(新→旧)");
    [...info.summaries].reverse().forEach((s, i) => L.push(`${i + 1}. ${cleanLine(s.text, 400)}`));
    L.push("");
  }
  if (info.lastPrompts.length) {
    L.push("## 最后任务(last-prompt)");
    [...info.lastPrompts].reverse().forEach((p) => L.push("- " + cleanLine(p, 300)));
    L.push("");
  }
  if (info.editedFiles.length) {
    L.push("## 动过的文件");
    info.editedFiles.forEach((f) => L.push(`- ${f.path} (${f.ops})`));
    L.push("");
  }
  if (info.lastUserMessages.length && !info.localCommandMode) {
    L.push("## 最近的用户消息");
    info.lastUserMessages.forEach((m) => L.push("- " + cleanLine(m, 300)));
    L.push("");
  }
  if (info.lastAssistantText) {
    L.push("## 最后一条助手回复");
    L.push(cleanLine(info.lastAssistantText, 800));
    L.push("");
  }
  L.push("请基于以上上下文继续工作。");
  return L.join("\n");
}

function renderMarkdown(info) {
  const L = [];
  L.push(`# 会话续接文档:${info.title}`);
  L.push("");
  L.push("> 由 dsh-plugin-claude-import 生成 · 源会话:`" + info.id.slice(0, 8) + "…`");
  L.push("");
  L.push("## 会话元信息");
  L.push("");
  L.push(`- **项目目录**:\`${info.projectDir}\``);
  L.push(`- **会话 ID**:\`${info.id}\``);
  L.push(`- **AI 标题**:${info.title}`);
  if (info.localCommandMode) L.push("- **⚠️ 本地命令模式**:消息多为命令注入(local-command),人工问答较少");
  L.push(`- **时间范围**:${fmtTime(info.firstTs)} → ${fmtTime(info.lastTs)}`);
  L.push(`- **文件大小**:${fmtSize(info.sizeBytes)}`);
  L.push(`- **消息统计**:user × ${info.userMessages} / assistant × ${info.assistantMessages} / tool_call × ${info.toolCalls} / tool_error × ${info.errorResults}`);
  L.push("");
  if (info.summaries.length) {
    L.push("## 上下文链(自动摘要,新→旧)");
    L.push("");
    [...info.summaries].reverse().forEach((s, i) => {
      L.push(`${i + 1}. ${s.text}`);
      L.push("");
    });
  }
  if (info.lastPrompts.length) {
    L.push("## 最后任务(last-prompt 快照)");
    L.push("");
    [...info.lastPrompts].reverse().forEach((p) => L.push(`- ${cleanLine(p, 300)}`));
    L.push("");
  }
  if (!info.localCommandMode && info.firstUserPrompt) {
    L.push("## 首条真实用户消息");
    L.push("");
    L.push("> " + info.firstUserPrompt.replace(/\n/g, "\n> "));
    L.push("");
  }
  if (info.editedFiles.length) {
    L.push("## 动过的文件(Write/Edit)");
    L.push("");
    info.editedFiles.forEach((f) => L.push(`- \`${f.path}\` — ${f.ops}`));
    L.push("");
  }
  L.push("## 会话尾部状态");
  L.push("");
  if (info.lastUserMessages.length) {
    L.push("最近用户消息:");
    info.lastUserMessages.forEach((m) => L.push(`- ${cleanLine(m, 300)}`));
    L.push("");
  }
  if (info.lastAssistantText) {
    L.push("最后一条助手回复:");
    L.push("");
    L.push("> " + info.lastAssistantText.replace(/\n/g, "\n> "));
    L.push("");
  }
  L.push("## 未完成线索");
  L.push("");
  L.push(`> ⚠️ 启发式提示,请人工确认:错误计数 **${info.errorResults}**、最后任务/最近回复是否以问题或待办结尾、summary 链末段是否提及 TODO / 下一步 / 待验证。`);
  L.push("");
  return L.join("\n");
}

function cleanLine(text, limit) {
  const one = String(text).replace(/\s+/g, " ").trim();
  return one.length <= limit ? one : one.slice(0, limit - 1) + "…";
}

function apply(ctx) {
  ctx.tools.register(defineTool({
    name: "claude_session_list",
    description: "列出 Claude Code 的历史会话(~/.claude/projects 下的 JSONL)。返回每个会话的 ID 前缀、项目、标题(AI 标题/摘要/首问)、最后修改时间、大小与消息统计。在 claude_session_import 之前先用它定位目标会话。",
    parameters: {
      projectsRoot: {
        type: "string",
        description: "可选:Claude Code 会话根目录,默认 ~/.claude/projects",
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          count: { type: "integer", required: true },
          sessions: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string", required: true },
                project: { type: "string", required: true },
                title: { type: "string", required: true },
                mtime: { type: "integer", required: true },
                sizeBytes: { type: "integer", required: true },
                userMessages: { type: "integer", required: true },
                assistantMessages: { type: "integer", required: true },
                toolCalls: { type: "integer", required: true },
                errorResults: { type: "integer", required: true },
                localCommandMode: { type: "boolean", required: true },
              },
            },
          },
        },
      },
      render: (args, value) => [{
        type: "text",
        text: `Claude Code 会话:共 ${value.count} 个。${value.sessions
          .map((s) => `${s.id} [${s.project}] "${s.title}" (${s.userMessages}u/${s.toolCalls}t/${s.errorResults}e)`)
          .join(" | ")}`,
      }],
    },
    execute: async (args) => {
      const files = listSessionFiles(args.projectsRoot || undefined);
      const sessions = files.map((f) => sessionSummary(parseSession(f.path, f.projectKey)));
      return { count: sessions.length, sessions };
    },
    presentCall: (args) => ({
      card: "generic",
      title: "List Claude Code sessions",
      kind: "other",
      rawInput: args,
    }),
  }));

  ctx.tools.register(defineTool({
    name: "claude_session_import",
    description: "导入一个 Claude Code 会话为可续接上下文:提取 AI 标题、自动摘要链(summary)、last-prompt 最后任务、动过的文件(Write/Edit/Read)与尾部状态。format=seed 输出适合粘贴为新会话开场上下文的文本块;format=markdown 输出完整续接文档。createSession=true 时,在 Claude 会话所属项目目录下新建一个 DSH 会话并把上下文作为首条消息投递过去(返回 newSessionId)。",
    parameters: {
      sessionId: {
        type: "string",
        required: true,
        description: "8 位前缀或完整会话 ID(来自 claude_session_list),或完整 .jsonl 路径",
      },
      format: {
        type: "string",
        enum: ["seed", "markdown"],
        description: "输出格式:seed(开场上下文块,默认)或 markdown(完整续接文档)",
      },
      createSession: {
        type: "boolean",
        description: "true 时在 Claude 会话所属项目目录下新建 DSH 会话并把上下文作为首条消息投递(默认 false,仅返回上下文文本)",
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", required: true },
          project: { type: "string", required: true },
          format: { type: "string", required: true },
          text: { type: "string", required: true },
          newSessionId: { type: "string" },
          workspaceId: { type: "string" },
          sessionCreated: { type: "boolean" },
          promptDelivered: { type: "boolean" },
          stats: {
            type: "object",
            additionalProperties: false,
            required: true,
            properties: {
              userMessages: { type: "integer", required: true },
              toolCalls: { type: "integer", required: true },
              errorResults: { type: "integer", required: true },
              editedFiles: { type: "integer", required: true },
              summaries: { type: "integer", required: true },
            },
          },
        },
      },
      render: (args, value) => [{
        type: "text",
        text: value.sessionCreated
          ? `已导入 Claude Code 会话 "${value.title}" 并新建 DSH 会话 ${value.newSessionId}(项目:${value.project})。`
          : `已导入 Claude Code 会话 "${value.title}"(${value.project}),格式 ${value.format}。`,
      }],
    },
    execute: async (args) => {
      const file = resolveSessionFile(args.sessionId);
      if (!file) {
        throw new Error(
          `找不到会话 "${args.sessionId}"。先调用 claude_session_list 查看可用会话 ID 前缀,或传入完整 .jsonl 路径。`
        );
      }
      const info = parseSession(file);
      const format = args.format || "seed";
      const text = format === "markdown" ? renderMarkdown(info) : renderSeed(info);
      const result = {
        title: info.title,
        project: info.projectDir,
        format,
        text,
        stats: {
          userMessages: info.userMessages,
          toolCalls: info.toolCalls,
          errorResults: info.errorResults,
          editedFiles: info.editedFiles.length,
          summaries: info.summaries.length,
        },
      };
      if (args.createSession) {
        // Ensure the Claude project exists as a workspace, then create the new
        // session inside it — that is what makes the project appear on the left.
        const api = ctx.apiProxy;
        const ws = await api.workspace.create({ path: info.projectDir });
        if (!ws.ok) {
          throw new Error(
            `创建工作区失败(${info.projectDir}):${ws.error ? ws.error.message : "未知错误"}`
          );
        }
        const workspaceId = ws.value.workspace.workspaceId;
        const created = await api.sessions.create({ workspaceId });
        if (!created.ok) {
          throw new Error(
            `创建新会话失败(项目 ${info.projectDir}):${created.error ? created.error.message : "未知错误"}`
          );
        }
        const newId = created.value.sessionId;
        // Deliver the continuable context as the new session's first message.
        let delivered = false;
        try {
          const prompted = await api.sessions.prompt({
            sessionId: newId,
            mode: "queue",
            content: [{ type: "text", text }],
          });
          delivered = !!(prompted && prompted.ok);
        } catch (e) {
          delivered = false;
        }
        result.newSessionId = newId;
        result.sessionCreated = true;
        result.promptDelivered = delivered;
        result.workspaceId = workspaceId;
      }
      return result;
    },
    presentCall: (args) => ({
      card: "generic",
      title: "Import Claude Code session",
      kind: "other",
      rawInput: args,
    }),
  }));
}

export { Config, apply, inject, name };
