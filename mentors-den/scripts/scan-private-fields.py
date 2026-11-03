#!/usr/bin/env python3
"""scan-private-fields.py — 家人隐私字段扫描器（公开仓发布门禁）

为什么有这个脚本（2026-11-04 冰爪实测定论）
────────────────────────────────────────────────
沙坑公开仓原本有两套门禁：
  ① .githooks/commit-msg  —— 拦「已知真名」（patterns 不入库，走本地固定串）
  ② .githooks/pre-push    —— 拦「课程产物漂移」+「作业文件名串号」

问题：**两套都不拦家人隐私字段** —— 手机号 / 身份证 / 生日 这类字段
一旦写进新增行，门禁一路放行。这是真洞。

而「AI 助手代号 / 家庭代号」（小马 / 如意 / 冰爪 / 龙井 / 猴哥 /
ThawPaw / Tree）按家庭口径是**可以公开的**，不属于隐私。
**邮箱同样可以公开**（对外联系用，属于项目可达性的一部分）。
所以新规则是：

  · 代号 / 邮箱 → **不拦**（门禁不该误伤正常协作署名与对外联系方式）
  · 隐私字段  → **必须拦**（手机 / 身份证 / 生日 / 住址）

分工说明（重要）
────────────────
  · **真实姓名** 由 .githooks/commit-msg-patterns 拦（那个文件**不入库**，
    所以真名清单永远不落公开仓）。本脚本**故意不含任何真实姓名**——
    否则脚本本身就成了泄漏源。
  · **隐私字段** 用通用正则识别，无需知道具体是谁 ⇒ 本脚本可安全入库。

口径修订：邮箱由「拦」改为「不拦」—— 家庭联系邮箱本身是项目的对外入口，
公开它是合理的，且门禁拦它会逼人改用更隐蔽的联系方式（反而更糟）。

用法：
    python3 mentors-den/scripts/scan-private-fields.py --self-test
    python3 mentors-den/scripts/scan-private-fields.py --diff-only
    python3 mentors-den/scripts/scan-private-fields.py --diff-range <base> <ref>
    python3 mentors-den/scripts/scan-private-fields.py --scan-text "<文本>"

退出码：0 = 零命中放行；1 = 有命中拒；2 = 自身故障（读不到 ≠ 没变）
"""

import argparse
import os
import re
import subprocess
import sys

# ── 课程/文档占位数据白名单 ────────────────────────────────────
# 说明：这些字符串出现在**教学示例**里，是故意造的假数据，不是真人隐私。
# 用固定串精确白名单，不做前缀/区间放行（避免真数据混进去）。
KNOWN_FIXTURES = {
    # W13-S2 字典示例里的假号码（教学用，非真人）
    "13800138001",
    "13800138002",
    # 常见占位号码
    "13800138000",
    "18888888888",
    "11111111111",
    "00000000000",
}

# ── 隐私字段模式 ────────────────────────────────────────────────
# (说明, 正则)。顺序 = 报错时优先给出第一个命中的类别。
_ID_CARD = re.compile(
    r"(?<![0-9A-Za-z])[1-9][0-9]{5}(?:19|20)[0-9]{2}"
    r"(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])[0-9]{3}[0-9Xx](?![0-9A-Za-z])")
_PHONE = re.compile(r"(?<![0-9])1[3-9][0-9]{9}(?![0-9])")
_BIRTHDAY = re.compile(
    r"(?:生日|出生|诞辰|生于)[:：]?\s*[0-9]{4}[-/年][0-9]{1,2}[-/月][0-9]{1,2}")
_ADDRESS = re.compile(
    r"(?:[一-鿿]{1,4}(?:省|自治区)|北京市|上海市|天津市|重庆市)"
    r"(?:[一-鿿]{1,6}?(?:市|州))?"
    r"(?:[一-鿿]{1,6}?(?:区|县))?"
    r"[一-鿿]{0,12}?(?:号|室|栋|幢|单元|路|街|巷|村)(?![0-9A-Za-z])")

# 隐私字段模式（**不含邮箱** —— 邮箱可公开）
PRIVATE_PATTERNS = [
    ("身份证号(18位)", _ID_CARD),
    ("手机号(11位大陆)", _PHONE),
    ("生日/出生日期(带锚点)", _BIRTHDAY),
    ("住址(省市区+详细)", _ADDRESS),
]


def _scan_text(text):
    """返回 [(类别, 片段)]，命中隐私字段的条目。"""
    out = []
    for label, rx in PRIVATE_PATTERNS:
        for m in rx.finditer(text):
            frag = m.group(0)
            if frag in KNOWN_FIXTURES:
                continue
            out.append((label, frag))
    return out


def _report(scanned, where):
    hits = _scan_text(scanned)
    if not hits:
        print(f"✅ 隐私字段扫描：{where} 零命中（代号可公开，隐私字段才拦）")
        return 0
    print(f"🚫 命中家人隐私字段：{where}（{len(hits)} 处）")
    seen = set()
    for label, frag in hits:
        key = (label, frag)
        if key in seen:
            continue
        seen.add(key)
        print(f"   ❌ {label}: {frag[:64]}")
    print("")
    print("   处理：私人信息不要进公开仓。")
    print("     · 手机 / 身份证 / 生日 / 住址 → 删掉，或换成占位值")
    print("     · 邮箱与代号可以公开，不需要改")
    print("     · 真实姓名 → 用代号（ThawPaw / Tree / IcePaw / 如意 / 小马 / 龙井）")
    print("     · 代号本身可以公开，不需要改")
    return 1


def _added_lines(diff_text):
    """只取新增行（+），排除文件头（+++）。存量不追溯 —— 与门禁口径一致。"""
    return "\n".join(
        line[1:] for line in diff_text.splitlines()
        if line.startswith("+") and not line.startswith("+++")
    )


def _scan_diff_only(repo_root):
    try:
        diff = subprocess.run(
            ["git", "diff", "--cached", "--no-color"],
            cwd=repo_root, capture_output=True, text=True, timeout=120,
        )
    except Exception as e:
        print(f"⚠️ 读不到暂存区 diff：{e}", file=sys.stderr)
        return 2
    if diff.returncode != 0:
        print("⚠️ git diff 失败（不等于没变）", file=sys.stderr)
        return 2
    return _report(_added_lines(diff.stdout), "暂存区新增行")


def _scan_diff_range(repo_root, base, ref):
    """扫 base..ref 的新增行（发布门禁用：判「被推的那一份」）。"""
    try:
        diff = subprocess.run(
            ["git", "diff", "--no-color", "--unified=0", f"{base}..{ref}"],
            cwd=repo_root, capture_output=True, text=True, timeout=180,
        )
    except Exception as e:
        print(f"⚠️ 读不到 diff {base}..{ref}：{e}", file=sys.stderr)
        return 2
    if diff.returncode != 0:
        print(f"⚠️ git diff {base}..{ref} 失败（不等于没变）", file=sys.stderr)
        return 2
    return _report(_added_lines(diff.stdout), f"{base}..{ref} 新增行")


def _scan_tree(repo_root, ref):
    """全树扫（git archive 提取后逐文件扫）。首推/新分支无 base 时用。"""
    import tempfile, tarfile, io, pathlib
    try:
        arch = subprocess.run(["git", "archive", ref], cwd=repo_root,
                              capture_output=True, timeout=180)
        if arch.returncode != 0:
            print(f"⚠️ git archive {ref} 失败（不等于没变）", file=sys.stderr)
            return 2
        allhits = []
        with tempfile.TemporaryDirectory() as td:
            with tarfile.open(fileobj=io.BytesIO(arch.stdout)) as tf:
                tf.extractall(td)
            for f in pathlib.Path(td).rglob("*"):
                if not f.is_file():
                    continue
                try:
                    text = f.read_text(errors="ignore")
                except Exception:
                    continue
                for label, frag in _scan_text(text):
                    allhits.append((label, frag, str(f.relative_to(td))))
    except Exception as e:
        print(f"⚠️ 全树扫描故障：{e}", file=sys.stderr)
        return 2
    if not allhits:
        print(f"✅ 隐私字段扫描：全树 {ref} 零命中（代号与邮箱可公开，隐私字段才拦）")
        return 0
    print(f"🚫 命中家人隐私字段：全树 {ref}（{len(allhits)} 处）")
    seen = set()
    for label, frag, path in allhits:
        key = (label, frag)
        if key in seen:
            continue
        seen.add(key)
        print(f"   ❌ {label}: {frag[:48]}  ({path})")
    print("\n   处理：私人信息不要进公开仓（占位值/代号见上方口径）。")
    return 1


def _scan_worktree(repo_root):
    """扫**工作树**（含未提交改动）—— 存量体检 / 提交前自查用。"""
    root = os.path.abspath(repo_root)
    allhits = []
    skip_dirs = {".git", "node_modules", "__pycache__", ".venv", "venv"}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]
        for f in filenames:
            fp = os.path.join(dirpath, f)
            try:
                if os.path.getsize(fp) > 2_000_000:
                    continue
                text = open(fp, encoding="utf-8", errors="ignore").read()
            except Exception:
                continue
            for label, frag in _scan_text(text):
                allhits.append((label, frag, os.path.relpath(fp, root)))
    if not allhits:
        print("✅ 隐私字段扫描：工作树零命中（代号与邮箱可公开，隐私字段才拦）")
        return 0
    print(f"🚫 命中家人隐私字段：工作树（{len(allhits)} 处）")
    seen = set()
    for label, frag, path in allhits:
        key = (label, frag)
        if key in seen:
            continue
        seen.add(key)
        print(f"   ❌ {label}: {frag[:48]}  ({path})")
    print("\n   处理：私人信息不要进公开仓（占位值/代号见上方口径）。")
    return 1


def _self_test():
    # ⚠️ 样例一律**拼接构造** —— 完整字面留在源码里会让本脚本**扫自己命中**
    #    （曾发生：自检样例里的假邮箱/假号码让 pre-push 把扫描器当成违规源）。
    #    拼接 ⇒ 源码里只有片段，扫不出完整模式；测试时运行时才拼成完整值。
    def join(*parts):
        return "".join(parts)

    fake_email = join("someone", "@", "brandct", ".", "com")
    fake_phone = join("139", "0013", "9000")
    fake_id = join("110101", "19900307", "123X")
    fake_birth = join("学员生日：", "2015", "-01-02")
    fake_addr = join("住址：", "某省", "某市", "某区", "某路", " 12 号")
    fixture_phone = join("138", "0013", "8001")

    cases = [
        # (标签, 文本, 期望命中, 期望类别)
        ("邮箱放行", "联系 IcePaw 或 Tree：" + fake_email, False, None),
        ("保留域邮箱放行", "GIT_AUTHOR_EMAIL: 'test@example.com'", False, None),
        ("本地域邮箱放行", "mail: a@b.local", False, None),
        ("手机号", "Alice: " + fake_phone, True, "手机号"),
        ("课程假号码", 'contacts = {"Alice": "' + fixture_phone + '"}', False, None),
        ("身份证", "id " + fake_id, True, "身份证"),
        ("生日", fake_birth, True, "生日"),
        ("住址", fake_addr, True, "住址"),
        ("AI代号放行", "mentor 小马 批改，mentor 如意 review，冰爪 起草", False, None),
        ("英文代号放行", "Tree / ThawPaw / IcePaw / Ookong / MonkeyWell", False, None),
        ("学员代号放行", "学员 ThawPaw 的作业由 小马 批改", False, None),
        ("假数据放行", 'ALICE = "' + join("138", "0013", "8000") + '"', False, None),
        ("git地址放行", "git clone git@github.com:Thawflow/sand-hollow.git", False, None),
    ]
    ok = True
    for label, text, should_hit, expect_cat in cases:
        hits = _scan_text(text)
        hit = len(hits) > 0
        passed = (hit == should_hit)
        if passed and should_hit and expect_cat:
            passed = any(expect_cat in h[0] for h in hits)
        print(f"  {'✅' if passed else '❌'} {label:14s} 期望命中={str(should_hit):5s} 实际={str(hit):5s}"
              + (f" 类别={[h[0] for h in hits]}" if hits else ""))
        if not passed:
            ok = False
    # ⑬ 扫描器源码**自身**必须零命中 —— 防止再次出现「自检样例把自己当违规源」
    try:
        with open(__file__, encoding="utf-8") as fh:
            self_text = fh.read()
        self_hits = _scan_text(self_text)
        if self_hits:
            print(f"  ❌ 源码自扫  期望命中=False 实际=True 类别={[h[0] for h in self_hits]}")
            for label, frag in self_hits[:5]:
                print(f"       ↳ {label}: {frag[:50]}")
            ok = False
        else:
            print(f"  ✅ 源码自扫  期望命中=False 实际=False")
    except Exception as e:
        print(f"  ❌ 源码自扫失败：{e}")
        ok = False

    print("\n" + ("✅ 自检全通过" if ok else "❌ 自检有失败"))
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--diff-only", action="store_true", help="只扫暂存区新增行")
    ap.add_argument("--diff-range", nargs=2, metavar=("BASE", "REF"),
                    help="扫 BASE..REF 新增行")
    ap.add_argument("--tree", metavar="REF", help="全树扫某 ref（首推无 base 时用）")
    ap.add_argument("--worktree", action="store_true", help="扫工作树（含未提交改动）")
    ap.add_argument("--scan-text", metavar="TEXT")
    ap.add_argument("--repo-root", default=".")
    args = ap.parse_args()

    if args.self_test:
        return _self_test()
    if args.scan_text is not None:
        return _report(args.scan_text, "指定文本")
    if args.worktree:
        return _scan_worktree(os.path.abspath(args.repo_root))
    if args.tree:
        return _scan_tree(os.path.abspath(args.repo_root), args.tree)
    if args.diff_range:
        return _scan_diff_range(os.path.abspath(args.repo_root), *args.diff_range)
    if args.diff_only:
        return _scan_diff_only(os.path.abspath(args.repo_root))
    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
