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
    '12345678/homework/w02-s5.py': 'print(1)\n',
  });
  const j = runChecker(root);
  const names = j.students.map((s) => s.student_dir);
  assert.ok(!names.includes('probe-tmp'), `探针目录被当成学员：${names.join(',')}`);
  assert.ok(names.includes('12345678'), `真学员被漏掉：${names.join(',')}`);
});

test('8 位数字目录里的 probe.py 不算学员练习（文件名层）', () => {
  const root = makeCloneRoot({
    '87654321/homework/probe.py': '# probe\n',
  });
  const j = runChecker(root);
  const s = j.students.find((x) => x.student_dir === '87654321');
  assert.ok(s, '学员目录应存在（目录本身是真学员形态）');
  assert.strictEqual(s.file_last, null, `probe.py 的 mtime 被算成活跃：file_last=${s.file_last}`);
});

test('标记文件放在学员目录根 ⇒ 整棵不采', () => {
  const root = makeCloneRoot({
    '87654321/.probe': 'x\n',
    '87654321/homework/real.py': 'print(1)\n',
  });
  const j = runChecker(root);
  assert.ok(!j.students.some((x) => x.student_dir === '87654321'), '带标记的学员目录应被排除');
});

test('★ 标记文件放在 homework/ 里面 ⇒ 整棵不采（11-01 修的洞）', () => {
  const root = makeCloneRoot({
    '87654321/homework/.probe': 'x\n',
    '87654321/homework/real.py': 'print(1)\n',
  });
  const j = runChecker(root);
  assert.ok(
    !j.students.some((x) => x.student_dir === '87654321'),
    '标记在 homework/ 里时整棵探针树应被排除'
  );
});

test('★ 标记文件放在 reviews/ 里面 ⇒ 整棵不采', () => {
  const root = makeCloneRoot({
    '87654321/reviews/PROBE.md': 'x\n',
    '87654321/reviews/notes.md': 'hi\n',
  });
  const j = runChecker(root);
  assert.ok(
    !j.students.some((x) => x.student_dir === '87654321'),
    '标记在 reviews/ 里时整棵探针树应被排除'
  );
});

test('★ 标记文件放在 homework/ 里 ⇒ 标记自身 mtime 不算活跃', () => {
  // 只有标记文件、没有真练习 ⇒ 判据 B 应为「无」
  const root = makeCloneRoot({
    '87654321/homework/.probe': 'x\n',
  });
  const j = runChecker(root);
  const s = j.students.find((x) => x.student_dir === '87654321');
  if (s) {
    assert.strictEqual(s.file_last, null, `标记自身 mtime 被算成活跃：file_last=${s.file_last}`);
  }
});

test('真学员不被误杀（无标记 ⇒ 照常出现且算得出活跃日）', () => {
  const root = makeCloneRoot({
    '12345678/homework/w02-s5.py': 'print(1)\n',
    '12345678/reviews/r1.md': '# review\n',
  });
  const j = runChecker(root);
  const s = j.students.find((x) => x.student_dir === '12345678');
  assert.ok(s, '真学员应出现在名单里');
  assert.ok(s.file_last, '真学员应有 file_last');
});

test('标记与真练习并存于根层 ⇒ 仍整棵不采（标记优先）', () => {
  const root = makeCloneRoot({
    '87654321/.probe-marker': 'x\n',
    '87654321/homework/real.py': 'print(1)\n',
  });
  const j = runChecker(root);
  assert.ok(!j.students.some((x) => x.student_dir === '87654321'), '根层标记应优先于真练习');
});

// ─────────────────────────────────────────────────────────────
// 3. ★ 跨机失真洞（11-01 · review 报出）
//    病：判据 B（文件 mtime）把**被 git 跟踪**的作业/评语也算进去
//      ⇒ 全新 clone 上这些文件的 mtime = checkout 时刻 ⇒ 读成「今天」
//      ⇒ 零活跃学员在 clone 上被误报成「活跃」（假绿）。
//    实测（11-01）：本机 tree B=2026-10-07(25天)=零活跃；
//      全新 clone 同一脚本 B=2026-11-01(0天)=活跃。
//    修：① B 只采信【未被跟踪】的文件 ② 被跟踪的一律走 A ③ mtime≈checkout ⇒ 不可判
//
//    ⚠️ 测法注意：检查器的 REPO 取自脚本自身位置（`__file__` 上溯三级），
//    不是 cwd ⇒ 要让检查器扫一个临时 git 仓，必须把脚本**复制进那个仓**
//    （仓根 = <tmp>/mentors-den/scripts/student-activity-check.py ⇒ REPO = <tmp>）。
// ─────────────────────────────────────────────────────────────

// 把检查器脚本复制进给定仓根，让它把该仓当自己的仓来扫。
function installChecker(root) {
  const dir = path.join(root, 'mentors-den', 'scripts');
  fs.mkdirSync(dir, { recursive: true });
  const dst = path.join(dir, 'student-activity-check.py');
  fs.copyFileSync(SCRIPT, dst);
  return dst;
}

// 在给定仓根里跑检查器（JSON），并把仓外克隆根指向不存在的路径（只扫本仓）。
function runCheckerInRepo(root, extraArgs = []) {
  const script = installChecker(root);
  const r = spawnSync('python3', [script, '--json', ...extraArgs], {
    cwd: root,
    env: { ...process.env, SAND_HOLLOW_CLONE_ROOTS: path.join(root, '__no_such_clone__') },
    encoding: 'utf8',
  });
  assert.ok(r.stdout.trim(), `检查器无输出：\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

function gitIn(root, args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8' });
}

test('★ 被 git 跟踪的作业文件 ⇒ 判据 B 不采信（走判据 A）', () => {
  // 造一个真 git 仓：tracked 作业 + 未跟踪作业各一
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sac-git-'));
  const student = '12345678';
  fs.mkdirSync(path.join(root, student, 'homework'), { recursive: true });
  const tracked = path.join(root, student, 'homework', 'tracked.py');
  const untracked = path.join(root, student, 'homework', 'untracked.py');
  fs.writeFileSync(tracked, 'print(1)\n');
  fs.writeFileSync(untracked, 'print(2)\n');
  gitIn(root, ['init', '-q']);
  gitIn(root, ['config', 'user.email', 't@t.local']);
  gitIn(root, ['config', 'user.name', 'T']);
  gitIn(root, ['add', '-f', `${student}/homework/tracked.py`]);
  gitIn(root, ['commit', '-q', '-m', 'add tracked']);
  // 两个文件 mtime 拉开 10 天（都远晚于 checkout 时刻）⇒ 不触发「checkout 物化」规则
  const now = Date.now() / 1000;
  fs.utimesSync(tracked, now - 40 * 86400, now - 40 * 86400);
  fs.utimesSync(untracked, now - 30 * 86400, now - 30 * 86400);

  const j = runCheckerInRepo(root);
  const s = j.students.find((x) => x.student_dir === student);
  assert.ok(s, `学员目录应被发现：${JSON.stringify(j.students.map((x) => x.student_dir))}`);
  assert.strictEqual(s.tracked_count, 1, `tracked_count 应为 1，实际 ${s.tracked_count}`);
  // tracked 文件被排除 ⇒ 判据 B 只看 untracked.py
  assert.ok(s.file_last, 'untracked 文件应仍能算出 file_last');
  const d = new Date(s.file_last + 'T00:00:00Z').getTime() / 1000;
  assert.ok(
    Math.abs(d - (now - 30 * 86400)) < 86400,
    `file_last 应指向未跟踪文件（30 天前），实际 ${s.file_last}`
  );
});

test('★ 全部作业都被跟踪 ⇒ 判据 B = never（不报假绿）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sac-git2-'));
  const student = '87654321';
  fs.mkdirSync(path.join(root, student, 'homework'), { recursive: true });
  fs.writeFileSync(path.join(root, student, 'homework', 'tracked.py'), 'print(1)\n');
  gitIn(root, ['init', '-q']);
  gitIn(root, ['config', 'user.email', 't@t.local']);
  gitIn(root, ['config', 'user.name', 'T']);
  gitIn(root, ['add', '-f', `${student}/homework/tracked.py`]);
  gitIn(root, ['commit', '-q', '-m', 'add tracked']);

  const j = runCheckerInRepo(root);
  const s = j.students.find((x) => x.student_dir === student);
  assert.ok(s, '学员目录应被发现');
  assert.strictEqual(s.file_last, null, `tracked 文件被算进 B ⇒ file_last=${s.file_last}`);
  assert.strictEqual(s.file_undetermined, false, '没有可疑证据 ⇒ 不该标不可判');
});

test('★ 全新 clone 上判据 B 不再读成「今天」（跨机假绿洞的回归网）', () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'sac-src-'));
  const student = '12345678';
  fs.mkdirSync(path.join(src, student, 'homework'), { recursive: true });
  fs.writeFileSync(path.join(src, student, 'homework', 'hw.py'), 'print(1)\n');
  gitIn(src, ['init', '-q']);
  gitIn(src, ['config', 'user.email', 't@t.local']);
  gitIn(src, ['config', 'user.name', 'T']);
  gitIn(src, ['add', '-f', `${student}/homework/hw.py`]);
  gitIn(src, ['commit', '-q', '-m', 'add']);

  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'sac-clone-'));
  const c = spawnSync('git', ['clone', '-q', src, clone], { encoding: 'utf8' });
  assert.strictEqual(c.status, 0, `clone 失败：${c.stderr}`);

  // clone 出来的文件 mtime = checkout 时刻 ⇒ 旧口径会读成「今天」
  const st = fs.statSync(path.join(clone, student, 'homework', 'hw.py'));
  const idx = fs.statSync(path.join(clone, '.git', 'index'));
  assert.ok(
    Math.abs(st.mtimeMs - idx.mtimeMs) < 300000,
    '前提不成立：clone 文件的 mtime 应 ≈ checkout 时刻'
  );

  const j = runCheckerInRepo(clone);
  const s = j.students.find((x) => x.student_dir === student);
  assert.ok(s, '学员目录应被发现');
  assert.strictEqual(
    s.file_last, null,
    `clone 上 tracked 文件被算进 B ⇒ 假绿：file_last=${s.file_last}`
  );
});

test('★ mtime ≈ checkout 时刻的未跟踪文件 ⇒ 标「不可判」（不报绿不报红）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sac-git3-'));
  const student = '87654321';
  fs.mkdirSync(path.join(root, student, 'homework'), { recursive: true });
  fs.writeFileSync(path.join(root, student, 'homework', 'hw.py'), 'print(1)\n');
  gitIn(root, ['init', '-q']);
  gitIn(root, ['config', 'user.email', 't@t.local']);
  gitIn(root, ['config', 'user.name', 'T']);
  gitIn(root, ['commit', '-q', '--allow-empty', '-m', 'init']);

  // 未跟踪文件，但 mtime 手工设成 .git/index 时刻（模拟 checkout 物化）
  const idx = fs.statSync(path.join(root, '.git', 'index'));
  const t = idx.mtimeMs / 1000;
  fs.utimesSync(path.join(root, student, 'homework', 'hw.py'), t, t);

  const j = runCheckerInRepo(root);
  const s = j.students.find((x) => x.student_dir === student);
  assert.ok(s, '学员目录应被发现');
  assert.strictEqual(s.file_last, null, `可疑证据不该被采信：file_last=${s.file_last}`);
  assert.strictEqual(s.file_undetermined, true, '应标 file_undetermined=true');
  assert.ok(
    String(s.verdict).includes('不可判'),
    `判定应含「不可判」，实际 verdict=${s.verdict}`
  );
});

// ─────────────────────────────────────────────────────────────
// 4. ★★ clone_roots() 两洞（11-01 · 如意 review 报出，我侧独立复现成立）
//
//    洞1：排除仓自身用 `os.path.abspath()` **字符串**比较
//      ⇒ 大小写不敏感 FS（macOS APFS 默认）上 `~/sand-hollow` 与 `~/Sand-Hollow`
//        是同一物理目录（samefile=True）但字符串不等
//      ⇒ 仓自身被当成「仓外克隆根」再扫一遍 ⇒ 双扫。
//      修法：`os.path.samefile()`。
//
//    洞2：`SAND_HOLLOW_CLONE_ROOTS=''`（空串）表达不了「不扫克隆根」
//      ⇒ 旧判据 `if raw else 默认` 把空串当「未设置」⇒ 静默回落默认根
//      ⇒ 验证时扫到了本机旧 clone ⇒ 结论假一致。
//      修法：`if raw is None` 判空。
//
//    ⚠️ 测法注意：clone_roots() 是纯函数但依赖 env + REPO（脚本自身位置），
//    所以直接 import 模块调它，而不是只看 --json 输出（双扫在 JSON 里会被
//    按名字合并掉 ⇒ 看不见）。
// ─────────────────────────────────────────────────────────────

// import 检查器模块，直接取 clone_roots()（不做任何合并，保留原始根列表）。
function loadCloneRoots(scriptPath, envExtra) {
  const code = [
    'import importlib.util, json',
    `spec = importlib.util.spec_from_file_location('sac', ${JSON.stringify(scriptPath)})`,
    'm = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)',
    'print(json.dumps({"roots": m.clone_roots()}, ensure_ascii=False))',
  ].join('\n');
  const r = spawnSync('python3', ['-c', code], {
    env: { ...process.env, ...envExtra },
    encoding: 'utf8',
  });
  assert.ok(r.stdout.trim(), `clone_roots() 无输出：\n${r.stderr}`);
  return JSON.parse(r.stdout.trim().split('\n').pop()).roots;
}

test('★★ 洞1：克隆根与仓自身是同一物理目录 ⇒ 仓自身不被当成仓外克隆根', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sac-home-'));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sac-repo-'));
  const script = installChecker(repo);
  // 同一物理目录的另一个名字（大小写不敏感 FS 上 case-variant 就是同一目录；
  // symlink 在大小写敏感 FS 上等价 —— 两者都要求用 samefile 而不是字符串比）
  const alias = path.join(home, 'alias-of-repo');
  fs.symlinkSync(repo, alias);
  assert.ok(
    fs.existsSync(alias),
    '前提不成立：alias 应指向仓自身'
  );

  const roots = loadCloneRoots(script, { SAND_HOLLOW_CLONE_ROOTS: alias });
  assert.strictEqual(
    roots.length, 0,
    `仓自身被当成仓外克隆根再扫一遍：${JSON.stringify(roots)}`
  );
});

test('★★ 洞2：SAND_HOLLOW_CLONE_ROOTS="" ⇒ 不扫任何克隆根（不回落到默认根）', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sac-home2-'));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sac-repo2-'));
  const script = installChecker(repo);
  // 造出「默认克隆根」：<HOME>/sand-hollow 存在 ⇒ 旧判据空串回落时它会被扫到
  fs.mkdirSync(path.join(home, 'sand-hollow'), { recursive: true });

  const roots = loadCloneRoots(script, { HOME: home, SAND_HOLLOW_CLONE_ROOTS: '' });
  assert.deepStrictEqual(
    roots, [],
    `空串应表示「不扫克隆根」，实际扫到了：${JSON.stringify(roots)}`
  );
});

test('★★ 回归：未设 env ⇒ 仍走默认克隆根（补丁没把功能打死）', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sac-home3-'));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sac-repo3-'));
  const script = installChecker(repo);
  fs.mkdirSync(path.join(home, 'sand-hollow'), { recursive: true });

  const env = { HOME: home };
  delete env.SAND_HOLLOW_CLONE_ROOTS;
  const roots = loadCloneRoots(script, env);
  assert.strictEqual(
    roots.length, 1,
    `未设 env 时应走默认克隆根，实际：${JSON.stringify(roots)}`
  );
  assert.ok(
    fs.existsSync(roots[0]),
    `默认克隆根应真实存在：${roots[0]}`
  );
});
