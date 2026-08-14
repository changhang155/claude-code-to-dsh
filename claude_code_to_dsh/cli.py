"""CLI entry point for claude-code-to-dsh."""

from __future__ import annotations

import argparse
import os
import sys

from . import __version__
from .parser import default_projects_root, list_session_files, parse_session
from .report import render_markdown, render_seed


def _resolve_session_path(arg: str, projects_root: str) -> str:
    """Accept a session-id prefix or a direct path to a .jsonl."""
    if os.path.isfile(arg):
        return arg
    for path, _key in list_session_files(projects_root):
        if os.path.basename(path).startswith(arg) or os.path.basename(path)[:8] == arg:
            return path
    raise SystemExit(f"未找到会话 '{arg}'。用 `list` 查看可用会话。")


def _fmt_size(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}"
        n /= 1024
    return f"{n:.1f} GB"


def cmd_list(args: argparse.Namespace) -> int:
    files = list_session_files(args.projects_root)
    if not files:
        print(f"在 {args.projects_root} 下没有找到任何会话。")
        return 1
    print(f"{'会话ID':<10} {'大小':>8}  {'时间(本地)':<16}  项目/标题")
    print("-" * 100)
    import time as _t
    for path, key in files:
        sid = os.path.basename(path)[:8]
        size = _fmt_size(os.path.getsize(path))
        when = _t.strftime("%m-%d %H:%M", _t.localtime(os.path.getmtime(path)))
        proj = key.replace("-Users-ch-code-", "").replace("-Users-ch-", "")
        title = "(解析标题需读文件,list 仅显示路径)"
        print(f"{sid:<10} {size:>8}  {when:<16}  {proj}  {path}")
    return 0


def cmd_export(args: argparse.Namespace) -> int:
    path = _resolve_session_path(args.session, args.projects_root)
    info = parse_session(path, max_lines=args.max_lines)
    md = render_markdown(info, include_reads=args.include_reads)
    out = args.output or f"session-{info.session_id[:8]}-continuation.md"
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(md)
    print(f"✓ 已导出续接文档 → {out}")
    print(f"  项目:{info.project_dir} · 标题:{info.title[:60]}")
    print(f"  摘要链 {len(info.summaries)} 条 · 改动文件 {len(info.edited_files)} 个 · "
          f"错误 {info.error_results} 次")
    return 0


def cmd_seed(args: argparse.Namespace) -> int:
    path = _resolve_session_path(args.session, args.projects_root)
    info = parse_session(path, max_lines=args.max_lines)
    block = render_seed(info)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(block)
        print(f"✓ 开场上下文块 → {args.output}")
    else:
        print(block)
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(
        prog="claude-code-to-dsh",
        description="把 Claude Code 会话提取成可续接的上下文文档(方案 A:context import)。",
    )
    p.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    p.add_argument("--projects-root", default=default_projects_root(),
                   help="Claude Code 会话根目录(默认 ~/.claude/projects)")
    sub = p.add_subparsers(dest="command", required=True)

    sp = sub.add_parser("list", help="列出所有会话")
    sp.set_defaults(func=cmd_list)

    sp = sub.add_parser("export", help="导出某个会话的续接文档(markdown)")
    sp.add_argument("session", help="会话 ID 前缀或 jsonl 路径")
    sp.add_argument("-o", "--output", help="输出文件(默认 session-<id>-continuation.md)")
    sp.add_argument("--include-reads", action="store_true", help="同时列出只读过的文件")
    sp.add_argument("--max-lines", type=int, default=None, help="最多解析行数(大文件调试用)")
    sp.set_defaults(func=cmd_export)

    sp = sub.add_parser("seed", help="生成可粘贴进新 DSH 会话的开场上下文块")
    sp.add_argument("session", help="会话 ID 前缀或 jsonl 路径")
    sp.add_argument("-o", "--output", help="写入文件而不是打印到 stdout")
    sp.add_argument("--max-lines", type=int, default=None, help="最多解析行数(大文件调试用)")
    sp.set_defaults(func=cmd_seed)

    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
