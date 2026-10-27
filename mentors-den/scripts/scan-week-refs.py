#!/usr/bin/env python3
"""scan-week-refs.py — 全仓扫「作业文件名串号」（周号 ≠ 本课周）

病灶（2026-10-27 复盘）：10-19 加餐前插把 W12/W14 从 W16 位置切出，正文
`W16-weekend-practice.py` 连字形态被窄正则漏扫（46 处债残余 6 处才清零）。
本脚本判据 = 不变量「文件名引用的周号必须 = 本课自己的周」，与
learning-publish.js 的作业文件名串号闸同一套正则（闸挡单周发布，本脚本全仓扫）。

用法（沙坑仓根目录跑）：
  python3 mentors-den/scripts/scan-week-refs.py                    # 扫工作树
  python3 mentors-den/scripts/scan-week-refs.py --ref origin/main   # 扫某 git ref
  python3 mentors-den/scripts/scan-week-refs.py --dir <dir>        # 扫指定目录

退出码：0 = 无串号；1 = 有串号；2 = 用法/环境错误
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

WEEK_REF_RE = re.compile(r"W\d\d-[A-Za-z0-9-]*\.py")


def course_dir_from_repo_root() -> Path:
    here = Path(__file__).resolve()
    return here.parent.parent / "course"


def list_files(root: Path):
    return sorted(p for p in root.glob("W*.md") if p.is_file())


def read_from_ref(repo: Path, ref: str, rel: str) -> str:
    out = subprocess.run(
        ["git", "show", f"{ref}:{rel}"],
        cwd=str(repo), capture_output=True, text=True,
    )
    if out.returncode != 0:
        return ""
    return out.stdout


def main() -> int:
    ap = argparse.ArgumentParser(description="全仓扫作业文件名串号（周号 ≠ 本课周）")
    ap.add_argument("--ref", help="扫 git ref（如 origin/main）而非工作树")
    ap.add_argument("--dir", help="扫指定目录（默认 <仓>/mentors-den/course）")
    args = ap.parse_args()

    repo = None
    if args.dir:
        root = Path(args.dir).resolve()
    else:
        root = course_dir_from_repo_root()
        repo = root.parent.parent  # mentors-den/course -> 仓根

    if not root.is_dir():
        print(f"❌ 课程目录不存在：{root}", file=sys.stderr)
        return 2
    if args.ref and repo is None:
        print("❌ --ref 只能配合默认课程目录使用（需要仓根定位）", file=sys.stderr)
        return 2

    files = list_files(root)
    hits = []
    for p in files:
        rel = p.relative_to(repo) if repo else p.name
        if args.ref:
            text = read_from_ref(repo, args.ref, str(rel))
        else:
            text = p.read_text(encoding="utf-8")
        own = p.name[:3]
        for m in WEEK_REF_RE.finditer(text):
            if m.group(0)[:3] != own:
                hits.append((str(rel), m.group(0), own))

    scope = args.ref or str(root)
    if hits:
        print(f"❌ 串号 {len(hits)} 处（范围：{scope}）：")
        for rel, tok, own in hits:
            print(f"   - {rel}：{tok}（本课周={own}）")
        return 1
    print(f"✅ 0 串号（范围：{scope}，扫 {len(files)} 个文件）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
