'use strict';
/**
 * 回归网：串号扫描器的 **ref 侧文件名解析改用 `-z`（NUL 切分）**（2026-11-09 冰爪拍板④）
 *
 * 病：`git ls-tree --name-only`（不带 -z）对**非 ASCII 文件名**做 C 风格 quote：
 *      `course/中文讲义.md` ⇒ 输出 `"course/\344\270\255\346\226\207.md"`
 *      ⇒ 尾部多一个引号 ⇒ `Path(name).suffix` = `.md"` ∉ COURSE_SUFFIXES
 *      ⇒ **该文件被当成非课程文件直接漏扫**（中文名 / 含空格名讲义扫不到）。
 *      同款污染也打在 `lesson_ids_from_ref()`（treeish 形式）上 ⇒ 课时登记表漏登记
 *      （含空格名的课时文件 stem 带引号 ⇒ 登记不上）。
 *
 * 后果（冰爪口径）：**ref 侧与工作树侧口径不一致** ——
 *      工作树侧走 os.walk / iterdir（拿到的是**原样文件名**）⇒ 扫得到、登记得上；
 *      ref 侧走 ls-tree（拿到的是 **quoted 文件名**）⇒ 扫不到、登记不上。
 *      ⇒ 同一个仓，pre-push 闸判的「被推那一份」与本地工作树判的不是同一件事。
 *
 * 修法：ls-tree 两处都加 `-z`（NUL 分隔 + **不 quote**）⇒ 解析按 NUL 切分。
 *
 * ⚠️ 验收口径：**必须用真 git push 验收**（同 pre-push-hook.test.js 的理由：
 *     手工调钩子与真 push 走的路径不等价）；本网另附「旧版必崩见证」。
 *
 * 断言：
 *   ① ref 侧含中文名讲义被扫到 ⇒ rc=1（旧版 rc=0 漏扫假绿）
 *   ② ref 侧含空格名课时文件被扫到 ⇒ rc=1（旧版 rc=0 漏扫假绿）
 *   ③ **两模式口径一致**：工作树模式与 ref 模式结论相同（rc 相同 + 扫到的文件数相同
 *      + 课时登记表数量相同）
 *   ④ 旧版必崩见证：把现版退回 plain+splitlines ⇒ ①③ 必须失败（否则本网分辨不出新旧）
 *   ⑤ 静态扫描：脚本里不得再有「ls-tree 不带 -z」或「splitlines 解析 ls-tree 输出」
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCANNER = path.join(REPO_ROOT, 'mentors-den', 'scripts', 'scan-week-refs.py');

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_TERMINAL_PROMPT: '0',
};

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} 失败：${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

function runScanner(args, cwd, script) {
  return spawnSync('python3', [(script || SCANNER)].concat(args || []), {
    encoding: 'utf8',
    env: GIT_ENV,
    cwd: cwd || REPO_ROOT,
  });
}

function tmpDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sand-hollow-z-' + tag + '-'));
}

/**
 * 隔离仓：course/ 下放
 *   ① W12-S1.md            —— 正常课时（登记表成员）
 *   ② W12-S1 补充.md       —— 课时文件名**含空格**（被 quote ⇒ 旧版登记不上）
 *   ③ 中文讲义.md          —— 讲义**含中文名**（被 quote ⇒ 旧版整篇漏扫）
 *
 * @param inject 往「中文讲义.md」里注入跨周串号（⇒ 期望 rc=1）
 */
function makeRepo(tag, inject) {
  const dir = tmpDir(tag);
  git(dir, ['init', '-q', '-b', 'main']);
  fs.mkdirSync(path.join(dir, 'course'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'course', 'W12-S1.md'), '# W12-S1 · 合成课时\n\n本周我们做一个练习。\n');
  fs.writeFileSync(path.join(dir, 'course', 'W12-S1 补充.md'), '# 补充讲义\n\n本周我们做一个练习。\n');
  fs.writeFileSync(path.join(dir, 'course', '中文讲义.md'),
    '# W12-S1 · 中文讲义\n' + (inject ? '\n新建 `W16-S9-homework.py`\n' : '\n本周我们做一个练习。\n'));
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'fixture']);
  return dir;
}

/** 课时登记表数量（脚本 ✅ 行里的「课时登记表 N 个课时」）*/
function registryCount(stdout) {
  const m = stdout.match(/课时登记表 (\d+) 个课时/);
  return m ? Number(m[1]) : null;
}

/** 扫到的文件数（脚本 ✅ 行里的「扫 N 个文件」）*/
function scannedCount(stdout) {
  const m = stdout.match(/扫 (\d+) 个文件/);
  return m ? Number(m[1]) : null;
}

test('① ref 侧：含中文名讲义里的串号被扫到 ⇒ rc=1（旧版 quote ⇒ 漏扫假绿）', () => {
  const dir = makeRepo('cjk', true);
  const r = runScanner(['--ref', 'HEAD', '--dir', 'course', '--course-dir', 'course'], dir);
  assert.strictEqual(r.status, 1,
    '含中文名讲义里的串号没被扫到（ref 侧漏扫）。stdout: ' + r.stdout + '\nstderr: ' + r.stderr);
  assert.ok(r.stdout.includes('W16-S9-homework.py'),
    '输出里没点名是哪个文件名：' + r.stdout);
});

test('② ref 侧：含空格名课时文件被扫到 ⇒ rc=1（旧版 quote ⇒ 漏扫假绿）', () => {
  const dir = makeRepo('space', false);
  // 把串号放进含空格名的文件里 ⇒ 旧版 ref 侧该文件根本不在扫描清单
  fs.writeFileSync(path.join(dir, 'course', 'W12-S1 补充.md'),
    '# 补充讲义\n\n新建 `W16-S9-homework.py`\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', '注入串号']);
  const r = runScanner(['--ref', 'HEAD', '--dir', 'course', '--course-dir', 'course'], dir);
  assert.strictEqual(r.status, 1,
    '含空格名课时文件里的串号没被扫到（ref 侧漏扫）。stdout: ' + r.stdout);
  assert.ok(r.stdout.includes('W16-S9-homework.py'),
    '输出里没点名是哪个文件名：' + r.stdout);
});

test('③ 两模式口径一致：工作树模式与 ref 模式结论相同（rc + 扫到文件数 + 课时登记表数）', () => {
  const dir = makeRepo('parity', false);      // 干净仓 ⇒ 两边都走 ✅ 分支，数字可比
  const work = runScanner(['--dir', 'course', '--course-dir', 'course'], dir);
  const ref = runScanner(['--ref', 'HEAD', '--dir', 'course', '--course-dir', 'course'], dir);
  assert.strictEqual(work.status, 0, '工作树侧不该命中。stdout: ' + work.stdout);
  assert.strictEqual(ref.status, 0, 'ref 侧不该命中。stdout: ' + ref.stdout);
  assert.strictEqual(scannedCount(work.stdout), scannedCount(ref.stdout),
    '两模式扫到的文件数不一致 ⇒ 两模式口径分裂（工作树原样名 vs ref quoted 名）。\n' +
    'work: ' + work.stdout + '\nref: ' + ref.stdout);
  assert.strictEqual(registryCount(work.stdout), registryCount(ref.stdout),
    '两模式课时登记表数量不一致 ⇒ 登记表漏登记（quoted 文件名）。\n' +
    'work: ' + work.stdout + '\nref: ' + ref.stdout);
  assert.strictEqual(registryCount(ref.stdout), 2,
    '课时登记表应是 2（W12-S1 + W12-S1 补充）⇒ 实际 ' + registryCount(ref.stdout) +
    '（含空格的课时没登记上）。stdout: ' + ref.stdout);
  assert.strictEqual(scannedCount(ref.stdout), 3,
    'ref 侧应扫到 3 个课程文件 ⇒ 实际 ' + scannedCount(ref.stdout) +
    '（中文名 / 含空格名漏扫）。stdout: ' + ref.stdout);
});

test('④ 旧版必崩见证：退回 plain + splitlines ⇒ ①③ 必须失败（否则本网分辨不出新旧）', () => {
  const cur = fs.readFileSync(SCANNER, 'utf8');
  // 把现版退回**修复前**的写法：ls-tree 不带 -z + 用 splitlines 解析
  const broke = cur
    .replace(/"ls-tree", "--name-only", "-z", treeish/g, '"ls-tree", "--name-only", treeish')
    .replace(/"ls-tree", "-r", "--name-only", "-z", ref/g, '"ls-tree", "-r", "--name-only", ref')
    .replace(/for name in out\.stdout\.split\("\\0"\):/g,
             'for name in [ln.strip() for ln in out.stdout.splitlines()]:');
  assert.ok(!broke.includes('"-z"'), '构造不出「ls-tree 不带 -z」的旧版 ⇒ 本网分辨不出新旧');
  assert.ok(broke.includes('splitlines()'), '构造不出「splitlines 解析」的旧版 ⇒ 本网分辨不出新旧');
  assert.ok(!broke.includes('out.stdout.split("\\0")'), '旧版不该再有 NUL 切分 ⇒ 构造没生效');

  const legacy = path.join(tmpDir('legacy'), 'scan-week-refs-legacy.py');
  fs.writeFileSync(legacy, broke);

  const dir = makeRepo('legacy', true);
  const r = runScanner(['--ref', 'HEAD', '--dir', 'course', '--course-dir', 'course'], dir, legacy);
  assert.strictEqual(r.status, 0,
    '旧版 ref 侧应是假绿 rc=0（中文名漏扫）。stdout: ' + r.stdout);

  // 工作树侧旧版仍然扫得到 ⇒ 正是「两模式口径不一致」的病根
  const work = runScanner(['--dir', 'course', '--course-dir', 'course'], dir, legacy);
  assert.strictEqual(work.status, 1, '旧版工作树侧应扫得到串号。stdout: ' + work.stdout);
  assert.notStrictEqual(work.status, r.status,
    '旧版两模式 rc 应当不一致（这正是被修的病）');

  // 旧版课时登记表漏登记（含空格的课时 stem 带引号 ⇒ 认不出）
  const reg = registryCount(work.stdout);
  assert.ok(reg === null || reg === 1,
    '旧版工作树侧登记表应为 1（只有 W12-S1）⇒ 实际 ' + reg + '。stdout: ' + work.stdout);
});

test('⑤ 静态扫描：脚本里不得再有「ls-tree 不带 -z」或「splitlines 解析 ls-tree 输出」', () => {
  const body = fs.readFileSync(SCANNER, 'utf8');
  const lines = body.split('\n');
  const offenders = [];
  lines.forEach((line, i) => {
    if (line.trim().startsWith('#')) return;          // 注释不算
    if (line.includes('"ls-tree"') && !line.includes('"-z"')) {
      offenders.push(`L${i + 1}: ${line.trim()}  ← ls-tree 没带 -z（文件名会被 quote）`);
    }
    if (line.includes('out.stdout.splitlines()')) {
      offenders.push(`L${i + 1}: ${line.trim()}  ← 用 splitlines 解析 ls-tree 输出（quote 后带尾引号）`);
    }
  });
  assert.deepStrictEqual(offenders, [],
    '串号扫描器 ref 侧又退回了会被 quote 的解析（中文名 / 含空格名漏扫）：\n' +
    offenders.join('\n'));
});
