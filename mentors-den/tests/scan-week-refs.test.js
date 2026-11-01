'use strict';
/**
 * scan-week-refs.py 的测试（串号扫描器 · 2026-10-31）
 *
 * 跑法：node --test mentors-den/tests/
 *
 * 判据口径（冰爪 10-31 实测 + 我方复现后定版）：
 *   ① 覆盖：源侧与产物侧**全部**课程文件都扫 —— 不只 W*.md / W*.html。
 *      旧 glob 只认 W* ⇒ 聚合文件全漏（源侧 SYLLABUS.md、产物侧 syllabus.html + index.json），
 *      实测「往源 SYLLABUS.md 注入串号 + 重建产物 ⇒ 旧闸 rc=0、串号直进远端」。
 *   ② 归属：课时文件（W12-S1.md / W12.html）按**文件名周号**判；
 *      聚合文件（SYLLABUS.md / syllabus.html / index.json）按**所在周次分节**判。
 *   ③ 通过条件：报出「扫 N 个文件」且 **N>0**；0 文件 / 读不到 ⇒ rc=2（没验到 ≠ 没问题）。
 *   ④ --ref 模式：文件清单与内容都取自**该 ref 的树** ⇒ 扫的是「被推的那份」，不是工作树。
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

function runScanner(args, cwd) {
  return spawnSync('python3', [SCANNER].concat(args || []), {
    encoding: 'utf8',
    env: GIT_ENV,
    cwd: cwd || REPO_ROOT,
  });
}

function tmpDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sand-hollow-scan-' + tag + '-'));
}

/** 建一个临时 git 仓，放课程文件，跑扫描器（可指定 --ref）*/
function makeRepo(tag, files) {
  const dir = tmpDir(tag);
  git(dir, ['init', '-q', '-b', 'main']);
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'fixture']);
  return dir;
}

const WEEK_MD = '# W12-S1 · 合成课时\n\n本周我们做一个练习。\n\n存为 W12-S1-homework.py\n';
const AGG_MD = '# 家庭编程课 · 大纲\n\n### W12 · 加餐③：数组 vs 链表\n\n存为 W12-weekend-practice.py\n';

test('源面（*.md）跨周 token 命中 ⇒ rc=1', () => {
  const dir = tmpDir('src-hit');
  fs.writeFileSync(path.join(dir, 'W12-S1.md'), '# W12-S1 · 合成课时\n\n新建 `W16-S9-homework.py`\n');
  const r = runScanner(['--dir', dir]);
  assert.strictEqual(r.status, 1, '期望 rc=1，实际 ' + r.status + '\nstdout: ' + r.stdout);
  assert.ok(r.stdout.includes('W16-S9-homework.py'), '输出里没点名是哪个文件名');
});

test('产物面（*.html）跨周 token 命中 ⇒ rc=1（旧 glob 只认 W*.md ⇒ 产物面会漏）', () => {
  const dir = tmpDir('prod-hit');
  fs.writeFileSync(path.join(dir, 'W12.html'), '<html>新建 `W16-S9-homework.py`</html>');
  const r = runScanner(['--dir', dir]);
  assert.strictEqual(r.status, 1, '期望 rc=1，实际 ' + r.status + '\nstdout: ' + r.stdout);
  assert.ok(r.stdout.includes('W16-S9-homework.py'), '输出里没点名是哪个文件名');
});

test('聚合文件（SYLLABUS.md，无 W* 前缀）跨周 token 命中 ⇒ rc=1（旧 glob 会漏）', () => {
  const dir = tmpDir('agg-hit');
  fs.writeFileSync(path.join(dir, 'SYLLABUS.md'), AGG_MD + '\n新建 `W16-S9-homework.py`\n');
  const r = runScanner(['--dir', dir]);
  assert.strictEqual(r.status, 1, '期望 rc=1，实际 ' + r.status + '\nstdout: ' + r.stdout);
  assert.ok(r.stdout.includes('W16-S9-homework.py'), '输出里没点名是哪个文件名');
});

test('本周自己的文件名不误伤 ⇒ rc=0', () => {
  const dir = tmpDir('ok');
  fs.writeFileSync(path.join(dir, 'W12-S1.md'), WEEK_MD);
  fs.writeFileSync(path.join(dir, 'W12.html'), '<html>存为 W12-S1-homework.py</html>');
  const r = runScanner(['--dir', dir]);
  assert.strictEqual(r.status, 0, '本周文件名被误拦，stdout: ' + r.stdout);
});

test('聚合文件里同周 token 不误伤（按所在分节判归属）⇒ rc=0', () => {
  const dir = tmpDir('agg-ok');
  fs.writeFileSync(path.join(dir, 'SYLLABUS.md'), AGG_MD);
  const r = runScanner(['--dir', dir]);
  assert.strictEqual(r.status, 0, '聚合文件同周引用被误拦，stdout: ' + r.stdout);
});

test('扫 0 个文件 = 没验到，不是「没问题」⇒ rc=2（不得报绿）', () => {
  const dir = tmpDir('empty');
  const r = runScanner(['--dir', dir]);
  assert.strictEqual(r.status, 2, '期望 rc=2，实际 ' + r.status + '\nstdout: ' + r.stdout);
  assert.ok(/扫 0 个文件/.test(r.stdout), '没说明是空扫：' + r.stdout);
  assert.ok(!/✅/.test(r.stdout), '空扫描不允许出现 ✅ 绿字样：' + r.stdout);
});

test('N>0 落地：通过条件 = 报出样本数且样本数 > 0', () => {
  const dir = tmpDir('sample');
  fs.writeFileSync(path.join(dir, 'W12.html'), '<html>存为 W12-S1-homework.py</html>');
  const r = runScanner(['--dir', dir]);
  assert.strictEqual(r.status, 0, '当周文件名应通过。stdout: ' + r.stdout);
  const m = r.stdout.match(/扫 (\d+) 个文件/);
  assert.ok(m, '输出里没报样本数：' + r.stdout);
  assert.ok(Number(m[1]) > 0, '样本数为 0 却报绿（假绿）：' + r.stdout);
});

test('--ref 指向不存在的 ref ⇒ 读不到 = rc=2（不报绿）', () => {
  const dir = makeRepo('badref', { 'W12-S1.md': WEEK_MD });
  const r = runScanner(['--ref', 'no-such-ref-xyz', '--dir', '.'], dir);
  assert.strictEqual(r.status, 2, '期望 rc=2，实际 ' + r.status + '\nstdout: ' + r.stdout);
});

test('--ref 扫的是 ref 快照：ref 干净但工作树脏 ⇒ rc=0（工作树脏不影响被推的那份）', () => {
  const dir = makeRepo('ref-clean', { 'W12-S1.md': WEEK_MD });
  fs.writeFileSync(path.join(dir, 'W12-S1.md'), '# W12-S1 · 合成课时\n\n新建 `W16-S9-homework.py`\n');
  const r = runScanner(['--ref', 'HEAD', '--dir', '.'], dir);
  assert.strictEqual(r.status, 0, '工作树有串号不该影响对 HEAD 的判定。stdout: ' + r.stdout);
});

test('--ref 扫的是 ref 快照：ref 脏但工作树干净 ⇒ rc=1（HEAD 有串号必须拦）', () => {
  const dir = makeRepo('ref-dirty', { 'W12-S1.md': WEEK_MD });
  // 造一个「ref 里有串号」的 commit
  fs.writeFileSync(path.join(dir, 'W12-S1.md'), '# W12-S1 · 合成课时\n\n新建 `W16-S9-homework.py`\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', '注入串号']);
  // 把工作树还原干净（从上一笔取干净内容 —— checkout -- 会从索引恢复，索引正是脏版本）
  const clean = git(dir, ['show', 'HEAD~1:W12-S1.md']);
  fs.writeFileSync(path.join(dir, 'W12-S1.md'), clean);
  assert.ok(!fs.readFileSync(path.join(dir, 'W12-S1.md'), 'utf8').includes('W16-S9-homework.py'), '工作树没还原干净');

  const r = runScanner(['--ref', 'HEAD', '--dir', '.'], dir);
  assert.strictEqual(r.status, 1, 'HEAD 有串号必须拦（扫的不是被推的那份）。stdout: ' + r.stdout);
});

test('逃生阀 --allow-week-refs 显式放行（须留痕）', () => {
  const dir = tmpDir('esc');
  fs.writeFileSync(path.join(dir, 'W12-S1.md'), '# W12-S1 · 合成课时\n\n新建 `W16-S9-homework.py`\n');
  const r = runScanner(['--dir', dir, '--allow-week-refs']);
  assert.strictEqual(r.status, 0, '逃生阀没放行，stdout: ' + r.stdout);
  assert.ok(r.stdout.includes('--allow-week-refs'), '输出里没留痕：' + r.stdout);
});

// ── 2026-10-31 续（冰爪红格：algopedia 双盲区）─────────────────────────────
// 洞 D：嵌套目录（course/algopedia/）旧版**完全不进扫描**（只 iterdir / 只 ls-tree 直接子项）
// 洞 E：课时改名后，正文/文件名里**指向已不存在的课时 ID** 旧版查不出来
test('递归覆盖：嵌套目录里的串号能被扫到（洞 D：algopedia/ 曾完全不在扫描范围）', () => {
  const dir = tmpDir('nested');
  fs.mkdirSync(path.join(dir, 'algopedia'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'W12-S1.md'), WEEK_MD);
  fs.writeFileSync(path.join(dir, 'algopedia', 'binary-big-o.md'),
    '# W12-S1 · 讲义\n\n新建 `W16-S9-homework.py`\n');
  const r = runScanner(['--dir', dir]);
  assert.strictEqual(r.status, 1, '嵌套目录的串号没被扫到。stdout: ' + r.stdout);
  assert.ok(r.stdout.includes('W16-S9-homework.py'), '输出里没点名是哪个文件名：' + r.stdout);
});

test('悬空课时 ID：作业文件名指向已不存在的课时 ⇒ rc=1（洞 E：改名后旧 ID 不该放过）', () => {
  const dir = tmpDir('dangling');
  fs.writeFileSync(path.join(dir, 'W12-S1.md'),
    '# W12-S1 · 合成课时\n\n新建 `W13-L03-homework.py`\n');
  const r = runScanner(['--dir', dir]);
  assert.strictEqual(r.status, 1, '悬空课时 ID 没被拦。stdout: ' + r.stdout);
  assert.ok(r.stdout.includes('W13-L03'), '输出里没点名是哪个课时 ID：' + r.stdout);
});

test('悬空课时 ID：H1 声明的课时不存在 ⇒ rc=1', () => {
  const dir = tmpDir('h1-dangling');
  fs.writeFileSync(path.join(dir, 'W12-S1.md'), '# W12-S1 · 合成课时\n\n正文。\n');
  fs.writeFileSync(path.join(dir, 'notes.md'), '# W99-S1 · 某个不存在的课\n\n正文。\n');
  const r = runScanner(['--dir', dir]);
  assert.strictEqual(r.status, 1, 'H1 悬空没被拦。stdout: ' + r.stdout);
  assert.ok(r.stdout.includes('W99-S1'), '输出里没点名是哪个课时 ID：' + r.stdout);
});

test('历史标记（「原 X」/「（现 …）」）不算悬空 ⇒ rc=0（有意指向旧课时，不是错）', () => {
  const dir = tmpDir('historical');
  fs.writeFileSync(path.join(dir, 'W12-S1.md'),
    '# W12-S1 · 合成课时\n\n> 本篇是原 W99-L01 的前半（历史标记，不拦）\n');
  const r = runScanner(['--dir', dir]);
  assert.strictEqual(r.status, 0, '历史标记被误拦。stdout: ' + r.stdout);
});

test('正文指针指向不存在的课时 ⇒ 只报不改（rc=0，但输出要有清单）', () => {
  const dir = tmpDir('prose-report');
  fs.writeFileSync(path.join(dir, 'W12-S1.md'),
    '# W12-S1 · 合成课时\n\n全勾 → 进入 W99-L02「下一课」。\n');
  const r = runScanner(['--dir', dir]);
  assert.strictEqual(r.status, 0, '正文指针不应拦 push。stdout: ' + r.stdout);
  assert.ok(r.stdout.includes('W99-L02'), '输出里没点名是哪个课时 ID：' + r.stdout);
});
