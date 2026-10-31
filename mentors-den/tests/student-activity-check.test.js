'use strict';
/**
 * student-activity-check.py 的测试（零活跃双判据检查器 · 探针排除层）
 *
 * 跑法：node --test mentors-den/tests/student-activity-check.test.js
 *
 * 写法约定：
 * - 每个用例 = 一个垂直切片，先看它红，再写实现。
 * - 全部在 os.tmpdir() 的临时目录里造学员目录，不碰工作树、不碰真机数据。
 * - fixture 学员 ID / 姓名全部虚构。
 *
 * 背景（11-01 修）：探针排除有三层（目录名 / 标记文件 / 文件名），
 * 但「标记文件放在 homework/ 或 reviews/ **里面**」这一层老判据漏了 ⇒
 * 探针目录被当成真学员 + 标记文件自己的 mtime 被当成学员活跃。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'mentors-den', 'scripts', 'student-activity-check.py');

// ── 造一棵假的「仓外克隆根」 ──
function makeCloneRoot(dirs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sac-test-'));
  for (const [rel, content] of Object.entries(dirs)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return root;
}

function runChecker(cloneRoot, extraArgs = []) {
  const r = spawnSync('python3', [SCRIPT, '--json', ...extraArgs], {
    cwd: REPO_ROOT,
    env: { ...process.env, SAND_HOLLOW_CLONE_ROOTS: cloneRoot },
    encoding: 'utf8',
  });
  assert.ok(r.stdout.trim(), `检查器无输出：\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

// ─────────────────────────────────────────────────────────────
// 1. 纯函数层：probe_reason 判据
// ─────────────────────────────────────────────────────────────
test('selftest: 探针判据单测通过（目录名 / 标记根 / 标记子目录 / 真学员）', () => {
  const r = spawnSync('python3', [SCRIPT, '--selftest'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `selftest 失败：\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /SELFTEST PASS/);
});

// ─────────────────────────────────────────────────────────────
// 2. 集成层：造目录 → 检查器看不见探针、看得见真学员
// ─────────────────────────────────────────────────────────────
test('探针目录（名字命中）不出现在学员名单里', () => {
  const root = makeCloneRoot({
    'probe-tmp/homework/probe.py': '# probe\n',
    '24602243/homework/w02-s5.py': 'print(1)\n',
  });
  const j = runChecker(root);
  const names = j.students.map((s) => s.student_dir);
  assert.ok(!names.includes('probe-tmp'), `探针目录被当成学员：${names.join(',')}`);
  assert.ok(names.includes('24602243'), `真学员被漏掉：${names.join(',')}`);
});

test('8 位数字目录里的 probe.py 不算学员练习（文件名层）', () => {
  const root = makeCloneRoot({
    '13579246/homework/probe.py': '# probe\n',
  });
  const j = runChecker(root);
  const s = j.students.find((x) => x.student_dir === '13579246');
  assert.ok(s, '学员目录应存在（目录本身是真学员形态）');
  assert.strictEqual(s.file_last, null, `probe.py 的 mtime 被算成活跃：file_last=${s.file_last}`);
});

test('标记文件放在学员目录根 ⇒ 整棵不采', () => {
  const root = makeCloneRoot({
    '13579246/.probe': 'x\n',
    '13579246/homework/real.py': 'print(1)\n',
  });
  const j = runChecker(root);
  assert.ok(!j.students.some((x) => x.student_dir === '13579246'), '带标记的学员目录应被排除');
});

test('★ 标记文件放在 homework/ 里面 ⇒ 整棵不采（11-01 修的洞）', () => {
  const root = makeCloneRoot({
    '13579246/homework/.probe': 'x\n',
    '13579246/homework/real.py': 'print(1)\n',
  });
  const j = runChecker(root);
  assert.ok(
    !j.students.some((x) => x.student_dir === '13579246'),
    '标记在 homework/ 里时整棵探针树应被排除'
  );
});

test('★ 标记文件放在 reviews/ 里面 ⇒ 整棵不采', () => {
  const root = makeCloneRoot({
    '13579246/reviews/PROBE.md': 'x\n',
    '13579246/reviews/notes.md': 'hi\n',
  });
  const j = runChecker(root);
  assert.ok(
    !j.students.some((x) => x.student_dir === '13579246'),
    '标记在 reviews/ 里时整棵探针树应被排除'
  );
});

test('★ 标记文件放在 homework/ 里 ⇒ 标记自身 mtime 不算活跃', () => {
  // 只有标记文件、没有真练习 ⇒ 判据 B 应为「无」
  const root = makeCloneRoot({
    '13579246/homework/.probe': 'x\n',
  });
  const j = runChecker(root);
  const s = j.students.find((x) => x.student_dir === '13579246');
  if (s) {
    assert.strictEqual(s.file_last, null, `标记自身 mtime 被算成活跃：file_last=${s.file_last}`);
  }
});

test('真学员不被误杀（无标记 ⇒ 照常出现且算得出活跃日）', () => {
  const root = makeCloneRoot({
    '24602243/homework/w02-s5.py': 'print(1)\n',
    '24602243/reviews/r1.md': '# review\n',
  });
  const j = runChecker(root);
  const s = j.students.find((x) => x.student_dir === '24602243');
  assert.ok(s, '真学员应出现在名单里');
  assert.ok(s.file_last, '真学员应有 file_last');
});

test('标记与真练习并存于根层 ⇒ 仍整棵不采（标记优先）', () => {
  const root = makeCloneRoot({
    '13579246/.probe-marker': 'x\n',
    '13579246/homework/real.py': 'print(1)\n',
  });
  const j = runChecker(root);
  assert.ok(!j.students.some((x) => x.student_dir === '13579246'), '根层标记应优先于真练习');
});
