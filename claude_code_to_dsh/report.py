"""Render a parsed session as a markdown continuation doc or a plain seed block."""

from __future__ import annotations

from datetime import datetime, timezone

from .parser import SessionInfo


def _fmt_size(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024
    return f"{n:.1f} GB"


def _fmt_ts(ts) -> str:
    if ts is None:
        return "?"
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def render_markdown(info: SessionInfo, include_reads: bool = False) -> str:
    """Full continuation document (markdown)."""
    L: list[str] = []
    L.append(f"# 会话续接文档:{info.title}")
    L.append("")
    L.append("> 由 claude-code-to-dsh 生成 · 源会话:`" + info.session_id[:8] + "…`")
    L.append("")

    L.append("## 会话元信息")
    L.append("")
    L.append(f"- **项目目录**:`{info.project_dir}`")
    L.append(f"- **会话 ID**:`{info.session_id}`")
    L.append(f"- **AI 标题**:{info.title}")
    if info.local_command_mode:
        L.append("- **⚠️ 本地命令模式**:消息多为命令注入(local-command),人工问答较少")
    L.append(f"- **时间范围**:{info.time_range}")
    L.append(f"- **文件大小**:{_fmt_size(info.size_bytes)}")
    L.append(f"- **消息统计**:user × {info.user_messages} / assistant × {info.assistant_messages} / "
             f"tool_call × {info.tool_calls} / tool_error × {info.error_results}")
    L.append("")

    if info.summaries:
        L.append("## 上下文链(自动摘要,新→旧)")
        L.append("")
        chain = list(reversed(info.summary_chain))
        for i, s in enumerate(chain, 1):
            L.append(f"{i}. {s}")
            L.append("")

    if info.last_prompts:
        L.append("## 最后任务(last-prompt 快照)")
        L.append("")
        for lp in reversed(info.last_prompts):
            L.append(f"- {_clean_line(lp, 300)}")
        L.append("")

    if not info.local_command_mode and info.first_user_prompt:
        L.append("## 首条真实用户消息")
        L.append("")
        L.append("> " + info.first_user_prompt.replace("\n", "\n> "))
        L.append("")

    if info.edited_files:
        L.append("## 动过的文件(Write/Edit)")
        L.append("")
        for path, ops in info.edited_files:
            L.append(f"- `{path}` — {ops}")
        L.append("")

    if include_reads and info.read_files:
        L.append("## 读过的文件")
        L.append("")
        for path in info.read_files:
            L.append(f"- `{path}`")
        L.append("")

    L.append("## 会话尾部状态")
    L.append("")
    if info.last_user_messages:
        L.append("最近用户消息:")
        for m in info.last_user_messages:
            one = " ".join(m.split())
            L.append(f"- {one[:300]}")
        L.append("")
    if info.last_assistant_text:
        L.append("最后一条助手回复:")
        L.append("")
        L.append("> " + info.last_assistant_text.replace("\n", "\n> "))
        L.append("")

    L.append("## 未完成线索")
    L.append("")
    L.append("> ⚠️ 以下为启发式提示,请人工确认:错误计数 "
             f"**{info.error_results}**、最后任务/最近一条助手回复是否以问题或待办结尾、"
             "summary 链最后一段是否提及 TODO / 下一步 / 待验证。")
    L.append("")
    return "\n".join(L)


def _clean_line(text: str, limit: int) -> str:
    one = " ".join(text.split())
    return one if len(one) <= limit else one[: limit - 1] + "…"


def render_seed(info: SessionInfo) -> str:
    """Plain-text block to paste as the opening context of a new DSH session."""
    L: list[str] = []
    L.append(f"【来自 Claude Code 会话 {info.session_id[:8]} 的续接上下文】")
    L.append(f"项目:{info.project_dir}")
    L.append(f"时间:{info.time_range}")
    if info.local_command_mode:
        L.append("⚠️ 本地命令模式会话(消息多为命令注入)")
    L.append("")
    L.append("## 主题")
    L.append(info.title)
    L.append("")
    if info.summaries:
        L.append("## 上下文链(新→旧)")
        for i, s in enumerate(reversed(info.summary_chain), 1):
            L.append(f"{i}. {s}")
        L.append("")
    if info.last_prompts:
        L.append("## 最后任务(last-prompt)")
        for lp in reversed(info.last_prompts):
            L.append("- " + _clean_line(lp, 300))
        L.append("")
    if info.edited_files:
        L.append("## 动过的文件")
        for path, ops in info.edited_files:
            L.append(f"- {path} ({ops})")
        L.append("")
    if info.last_user_messages and not info.local_command_mode:
        L.append("## 最近的用户消息")
        for m in info.last_user_messages:
            L.append("- " + " ".join(m.split())[:300])
        L.append("")
    if info.last_assistant_text:
        L.append("## 最后一条助手回复")
        L.append(" ".join(info.last_assistant_text.split())[:800])
        L.append("")
    L.append("请基于以上上下文继续工作。")
    L.append("")
    return "\n".join(L)
