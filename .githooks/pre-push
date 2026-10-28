#!/bin/bash
# pre-push：课程静态化防漂移门禁（2026-10-28 沙坑静态化改造）
#
# 要防的漂移形态（新增，不是老的 md→KV 漂移）：
#   mentors-den/course/*.md 改了，但 docs/course/*.html 没重建 → push 上去的站点
#   展示的是**旧课文**，而仓库里的 md 已经是新的 → 源与产物不一致，且**没人会发现**
#   （老形态是 md→KV，publish 脚本会体检；新形态 md→HTML，构建产物入库，要靠这个钩子）
#
# 判定：本次 push 的提交范围里，若有 course/*.md 或 SYLLABUS.md 变更，
#       则必须同时有 docs/course/ 下的产物变更（至少一次构建）。
#       判据用「重建后与仓库里的产物逐字节比对」——只有真的重建过才放行。
#
# 绕过（紧急情况）：git push --no-verify（需事后补跑 node mentors-den/scripts/build-course-html.js）
#
# 启用（每台机器一次，clone 不自带 hooks）：
#   cd ~/projects/sand-hollow && git config core.hooksPath .githooks && chmod +x .githooks/pre-push

set -u
ZERO=$(git hash-object -w /dev/null 2>/dev/null || echo 0000000000000000000000000000000000000000)

# ── 1) 确定推送范围 ──
# 本地分支 → 远端分支
if [ "$#" -ge 2 ]; then
  LOCAL_REF="$1"
  REMOTE_REF="$2"
else
  LOCAL_REF="HEAD"; REMOTE_REF=""
fi

# 远端已有的 commit（拿不到就退化成「与 merge-base 比」）
REMOTE_SHA=""
if [ -n "$REMOTE_REF" ] && [ "$REMOTE_REF" != "" ]; then
  REMOTE_SHA=$(git rev-parse "$REMOTE_REF" 2>/dev/null || true)
fi
if [ -z "$REMOTE_SHA" ] || [ "$REMOTE_SHA" = "$ZERO" ]; then
  # 远端还没有这个分支 → 与 origin/main 的 merge-base 比
  BASE=$(git merge-base HEAD origin/main 2>/dev/null || true)
  if [ -n "$BASE" ]; then REMOTE_SHA="$BASE"; fi
fi
if [ -z "$REMOTE_SHA" ]; then
  echo "⚠️  pre-push：拿不到远端基线（首次 push 到新远端？）→ 跳过防漂移检查"
  exit 0
fi

RANGE="$REMOTE_SHA..HEAD"

# ── 2) 课程源有没有变 ──
MD_CHANGED=$(git diff --name-only "$RANGE" -- 'mentors-den/course/*.md' 2>/dev/null || true)
if [ -z "$MD_CHANGED" ]; then
  # 源没变 → 产物不需要重建，放行
  exit 0
fi

echo "🔍 pre-push：检测到课程源变更 →"
echo "$MD_CHANGED" | sed 's/^/     /'
echo "   正在核对 docs/course/ 产物是否已重建…"

# ── 3) 真重建一次，逐字节比对仓库里的产物 ──
TMP_OUT=$(mktemp -d)
trap 'rm -rf "$TMP_OUT"' EXIT

if ! node mentors-den/scripts/build-course-html.js --out-dir "$TMP_OUT" >/dev/null 2>&1; then
  echo ""
  echo "🚫 pre-push 拒绝：课程构建失败（build-course-html.js 非零退出）"
  echo "   先修构建错误再 push —— 构建挂了说明产物会是坏的"
  exit 1
fi

# 比对：重建结果 vs 仓库里已提交的产物
DIFF_OUT=$(diff -rq "$TMP_OUT" docs/course 2>&1)
if [ -n "$DIFF_OUT" ]; then
  echo ""
  echo "🚫 pre-push 拒绝：docs/course/ 产物落后于 mentors-den/course/ 源（防漂移）"
  echo "$DIFF_OUT" | sed 's/^/     /'
  echo ""
  echo "   修法："
  echo "     node mentors-den/scripts/build-course-html.js"
  echo "     git add docs/course/ && git commit -m 'chore(course): 重建静态课程产物'"
  echo "   （产物要入 git —— GitHub Pages 靠仓库里的 HTML 直接发布，不在服务器上构建）"
  exit 1
fi

echo "✅ 课程产物与源一致（docs/course/ 已是最新重建结果）"
exit 0
