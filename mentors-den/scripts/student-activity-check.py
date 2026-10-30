#!/usr/bin/env python3
"""学员零活跃双判据检查器（2026-10-30 晨会 ⑥ 工具化 · 如意起头）。

背景（mentors-log 10-17 → 10-30 连续复现的手工判据，固化成脚本）：
  判据 A = git 维度：该学员目录末次被 commit 触碰的日期（git log -1 -- <dir>）
  判据 B = 文件维度：<dir>/homework/** 与 <dir>/reviews/** 里最新文件的 mtime
  零活跃判定 = A、B 两维都超过阈值天数（默认 7 天）⇒ 双判据同时为零才算，
  单维为零只提示（避免「交了作业没 commit」或「commit 了文档没交作业」误报）。

用法：
  python3 student-activity-check.py [--threshold 7] [--git-only] [--json]

输出（人类可读，逐学员一行）：
  <dir>  A=git:<date|never>(N天)  B=file:<date|never>(N天)  => 零活跃/活跃/单维零
退出码：0 = 无零活跃；1 = 有学员双判据零活跃（供 cron 判别）；2 = 参数错误。

⚠️ 口径边界（2026-10-30 实测踩到）：
  - 判据 A（git commit 日期）跨机器客观，任何 clone 上跑结果一致；
  - 判据 B（文件 mtime）是【本机】维度：homework/reviews 被 gitignore，
    内容只存在于作业落盘的那台 mentor 机 ⇒ 在别的 clone 上 B 会显示 never，
    不是学员真没交。权威判定请在作业落盘的机器上跑，或加 --git-only 只看 A。

⚠️ 学员目录发现范围（仓外克隆根也要扫）：
  旧版 REPO 取脚本所在仓根、发现只 `os.listdir(REPO)` ⇒ **只扫仓内根**。
  但 README L72 / mentors-rules L113 教学员把仓克隆到 `~/sand-hollow/` 再建
  `<学员ID>/homework/` ⇒ 那是**仓外克隆根** ⇒ 落在仓外的学员目录完全看不见。
  现口径 = **仓内根 + 仓外克隆根都扫**：
    · 仓外克隆根默认 `~/sand-hollow/`，可用环境变量 `SAND_HOLLOW_CLONE_ROOTS`
      （冒号分隔绝对路径）覆盖；
    · 仓外根不是 git 仓时判据 A **不适用**（不是「零」）⇒ 只按判据 B 判，
      `--git-only` 下标「跳过(非git仓)」而不是误报零活跃；
    · 根不存在 = 静默跳过（不是错）。

设计约束：
  - 不硬编码任何学员目录名：动态发现「根目录下含 homework/ 或 reviews/ 子目录」的目录
  - 不联网、不改任何文件；红线安全：输出只有目录名与日期，无真名
  - mtime 用本地文件系统（untracked 也算——学员本地交作业不走 git）
"""
import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKIP_DIRS = {".git", ".githooks", "docs", "mentors-den", "mentors-log", "algopedia"}
WATCH_SUBDIRS = ("homework", "reviews")
TZ = timezone(timedelta(hours=8))

# 学员目录发现要覆盖「仓外克隆根」：仓外根不是 git 仓时判据 A 不适用，
# 判据 B（文件 mtime）仍可判，与「仓内无记录」同义处理。
# 覆盖：环境变量 SAND_HOLLOW_CLONE_ROOTS（冒号分隔的绝对路径）。
DEFAULT_CLONE_ROOTS = ("~/sand-hollow",)


def clone_roots():
    """仓外克隆根列表：存在且不是仓自身才计入（不存在 = 静默跳过）。"""
    raw = os.environ.get("SAND_HOLLOW_CLONE_ROOTS", "")
    paths = [p for p in (raw.split(":") if raw else list(DEFAULT_CLONE_ROOTS)) if p.strip()]
    out = []
    for p in paths:
        p = os.path.expanduser(p.strip())
        if os.path.isdir(p) and os.path.abspath(p) != os.path.abspath(REPO):
            out.append(p)
    return out


def candidate_roots():
    """[(label, root_path)]：label = 'repo'（仓内根）/ 'clone'（仓外克隆根）。"""
    roots = [("repo", REPO)]
    for p in clone_roots():
        roots.append(("clone", p))
    return roots


def is_git_root(root):
    """该根是不是 git 仓工作区（判据 A 是否适用）。仓外克隆根常常不是。"""
    return os.path.isdir(os.path.join(root, ".git"))


def git_last_commit_date(root, rel_dir):
    """判据 A：目录末次 commit 日期（本地时间 YYYY-MM-DD），无记录返回 None。"""
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--", rel_dir],
            cwd=root, capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        return out or None
    except (subprocess.TimeoutExpired, OSError):
        return None


def newest_file_mtime_ts(root, rel_dir):
    """判据 B 的原始值：homework/ + reviews/ 下最新文件 mtime（时间戳），无文件返回 None。"""
    latest = None
    for sub in WATCH_SUBDIRS:
        base = os.path.join(root, rel_dir, sub)
        if not os.path.isdir(base):
            continue
        for root_dir, _dirs, files in os.walk(base):
            for name in files:
                path = os.path.join(root_dir, name)
                try:
                    latest_m = os.path.getmtime(path)
                except OSError:
                    continue
                if latest is None or latest_m > latest:
                    latest = latest_m
    return latest


def newest_file_mtime(root, rel_dir):
    """判据 B：homework/ + reviews/ 下最新文件 mtime → 本地日期，无文件返回 None。"""
    ts = newest_file_mtime_ts(root, rel_dir)
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, TZ).strftime("%Y-%m-%d")


def days_since(date_str):
    if not date_str:
        return None
    d = datetime.strptime(date_str, "%Y-%m-%d").date()
    return (datetime.now(TZ).date() - d).days


def discover_students():
    """返回 {student_dir: {label, root, git_root, mtime}}：按学员目录名**合并**多根。

    同一个学员目录名可能同时出现在仓内根和仓外克隆根（如学员把整仓克隆到
    ~/sand-hollow/ 后又在其中建自己的 <ID>/homework/）⇒ 按名字合并成**一条**，
    否则同一个学员会被计两次且两次判定可能相反（仓内 git 判据 vs 仓外文件判据）。
    合并口径：判据 A 取「是 git 仓的那个根」，判据 B 取各根里**最新**的文件 mtime。
    """
    merged = {}
    for label, root in candidate_roots():
        try:
            names = sorted(os.listdir(root))
        except OSError:
            continue
        git_root = is_git_root(root)
        for name in names:
            if name.startswith(".") or name in SKIP_DIRS or not os.path.isdir(os.path.join(root, name)):
                continue
            if not any(os.path.isdir(os.path.join(root, name, s)) for s in WATCH_SUBDIRS):
                continue
            mtime = newest_file_mtime_ts(root, name)
            prev = merged.get(name)
            if prev is None:
                merged[name] = {"label": label, "root": root, "git_root": git_root, "mtime": mtime}
                continue
            # 已有同名学员：判据 A 优先取 git 仓的根；判据 B 取更新的 mtime。
            if git_root and not prev["git_root"]:
                prev["git_root"] = True
                prev["root"] = root
                prev["label"] = label
            if prev["mtime"] is None or (mtime is not None and mtime > prev["mtime"]):
                prev["mtime"] = mtime
    return merged


def main():
    ap = argparse.ArgumentParser(description="学员零活跃双判据检查器")
    ap.add_argument("--threshold", type=int, default=7, help="零活跃阈值天数（默认 7）")
    ap.add_argument("--git-only", action="store_true", help="只用判据 A（git），适合非落盘机运行")
    ap.add_argument("--json", action="store_true", help="输出 JSON（供 cron 消费）")
    args = ap.parse_args()
    if args.threshold < 1:
        print("ERROR: --threshold 必须 >= 1", file=sys.stderr)
        sys.exit(2)

    students = discover_students()
    if not students:
        print("未发现任何学员目录（根目录下含 homework/ 或 reviews/）——检查目录结构")
        sys.exit(0)

    if not args.git_only and not args.json:
        print("⚠️ 判据 B=本机文件 mtime；homework/reviews 不入 git，跨机请用 --git-only 或在落盘机上跑\n")

    results, flagged = [], 0
    for name in sorted(students):
        info = students[name]
        label, root, git_root = info["label"], info["root"], info["git_root"]
        a_date = git_last_commit_date(root, name) if git_root else None
        b_ts = None if args.git_only else info["mtime"]
        b_date = (datetime.fromtimestamp(b_ts, TZ).strftime("%Y-%m-%d") if b_ts is not None else None)
        a_days, b_days = days_since(a_date), days_since(b_date)
        if not git_root:
            # 仓外克隆根不是 git 仓 ⇒ 判据 A 不适用（不是「零」）⇒ 只看判据 B。
            if args.git_only:
                verdict = "跳过(非git仓)"
            elif b_days is None:
                verdict = "零活跃(全新)"  # 无文件 = 目录刚建或从未活动
            elif b_days >= args.threshold:
                verdict = f"零活跃>={args.threshold}天"
                flagged += 1
            else:
                verdict = "活跃"
        elif a_days is None and (args.git_only or b_days is None):
            verdict = "零活跃(全新)"  # 两维都无记录：目录刚建或从未活动
        elif (a_days is None or a_days >= args.threshold) and (args.git_only or b_days is None or b_days >= args.threshold):
            verdict = f"零活跃>={args.threshold}天" + ("(仅git判据)" if args.git_only else "")
            flagged += 1
        elif a_days is None or b_days is None:
            verdict = "单维零(仅提示)"
        else:
            verdict = "活跃"
        results.append({
            "student_dir": name,
            "root": label,
            "git_last": a_date, "git_idle_days": a_days,
            "file_last": b_date, "file_idle_days": b_days,
            "verdict": verdict,
        })
        if not args.json:
            def fmt(d, n):
                return f"{d}({n}天)" if d is not None else "never"
            print(f"{name:<12} A=git:{fmt(a_date, a_days):<20} B=file:{fmt(b_date, b_days):<20} => {verdict}  [{label}]")

    if args.json:
        print(json.dumps({"threshold_days": args.threshold, "git_only": args.git_only,
                          "flagged": flagged, "students": results},
                         ensure_ascii=False, indent=2))
    else:
        total = len(results)
        mode = "仅判据A(git)" if args.git_only else "双判据(A=末次commit触碰目录, B=homework/reviews最新文件mtime; 双维同时零才算零活跃)"
        print(f"\n共 {total} 个学员目录：零活跃 {flagged}，阈值 {args.threshold} 天（{mode}）")
    sys.exit(1 if flagged else 0)


if __name__ == "__main__":
    main()
