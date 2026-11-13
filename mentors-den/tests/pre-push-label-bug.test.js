'use strict';
/**
 * 回归网：pre-push 钩子的 **$label 裸变量 + 全角标点** 崩溃（2026-11-09 冰爪实跑撞出）
 *
 * 病：`.githooks/pre-push` 的 run_scan() 里两处 `echo "…$label，…"` —— `$label` 后面
 *     紧跟**全角逗号**（U+FF0C）。bash 的变量名解析按「字母/数字/下划线」贪婪匹配，
 *     在 UTF-8 locale 下会把紧跟的全角字节当变量名的一部分 ⇒ 展开成 `label，` 这个
 *     并不存在的变量 ⇒ 脚本有 `set -u` ⇒ **unbound variable ⇒ 脚本当场退出（rc≠0）**。
 *
 * 后果（比「报错信息难看」严重得多）：
 *   - 该分支在**串号闸命中时**触发 ⇒ 本该「打印拒绝理由」的位置变成崩溃 ⇒ 闸崩。
 *   - 该分支在**遗留清单分支**触发 ⇒ 任何一次 push 都会走到 ⇒ **闸全崩 ⇒ push 全被误拒**。
 *     实测：`.githooks/pre-push` 直接 rc=1，错误信息 `line 75: label?: unbound variable`。
 *   - 崩溃发生在**闸自己的报错路径**上 ⇒ 闸「看起来在拦」，实际拦的理由是错的 ⇒ 误判。
 *
 * 修法：裸 `$label` → `${label}`（加花括号，明确变量名边界）。L61 早就是 `${label}`，
 *     只有 L63 / L75 两处是裸的 —— 这也是「同一文件里两种写法并存」的由来。
 *
 * ⚠️ 验收口径：**必须用真 `git push` 验收**（同 pre-push-hook.test.js 的理由：
 *     手工调钩子与真 push 走的路径不等价）。
 *
 * 断言：
 *   ① 现版钩子 + 触发遗留清单分支 ⇒ push 成功，且**输出里没有** unbound variable
 *   ② 回归见证：修复前的钩子原件（裸 $label）+ 同样场景 ⇒ 崩（unbound variable）⇒ 放行
 *   ③ 现版钩子里**不得再有**「裸 $var 紧跟非 ASCII 标点」的写法（静态扫描 ⇒ 防同类复发）
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HOOK = path.join(REPO_ROOT, '.githooks', 'pre-push');

const GIT_ENV = {
  ...process.env,
  // ⚠️ 2026-11-11 拍板④：locale 无关网。LC_ALL 钉死 en_US.UTF-8 —— 否则 ASCII 环境
  // （LC_ALL=C ⇒ charmap=US-ASCII）里 bash 3.2 不会把全角字节吞进变量名，
  // 「旧版必崩」的回归见证（断言②）假失败 ⇒ 网失去分辨力（LC_ALL=C 实测 2 pass / 1 fail）。
  LC_ALL: 'en_US.UTF-8',
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

function sh(cwd, cmd, args) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8', env: GIT_ENV });
}

/**
 * 隔离仓：bare 远端 + 工作副本（含钩子 / 构建脚本 / scanner / 隐私闸 / 一课内容）。
 * 与 pre-push-hook.test.js 同构。
 */
function makeRepo(tag, hookBody) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sand-hollow-label-' + tag + '-'));
  const remote = path.join(base, 'remote.git');
  const repo = path.join(base, 'work');
  fs.mkdirSync(repo);

  git(base, ['init', '--bare', remote]);
  git(base, ['clone', remote, repo]);

  fs.mkdirSync(path.join(repo, 'mentors-den', 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'mentors-den', 'course'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'docs', 'course'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'docs', 'vendor'), { recursive: true });
  fs.mkdirSync(path.join(repo, '.githooks'), { recursive: true });

  for (const rel of ['mentors-den/scripts/build-course-html.js',
                     'mentors-den/scripts/scan-week-refs.py',
                     'mentors-den/scripts/scan-private-fields.py',
                     'docs/vendor/marked.min.js']) {
    fs.copyFileSync(path.join(REPO_ROOT, rel), path.join(repo, rel));
  }
  fs.writeFileSync(path.join(repo, '.githooks', 'pre-push'), hookBody);
  fs.chmodSync(path.join(repo, '.githooks', 'pre-push'), 0o755);

  fs.writeFileSync(path.join(repo, 'mentors-den', 'course', 'SYLLABUS.md'),
    '# 家庭编程课 · 完整大纲（测试用）\n\n### W01 · 起步：让程序开口说话\n');
  const courseMd = path.join(repo, 'mentors-den', 'course', 'W01-L01.md');
  fs.writeFileSync(courseMd, '# W01-L01 · 合成课时\n\n本周我们做一个练习。\n');

  git(repo, ['config', 'core.hooksPath', '.githooks']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'chore: 课程骨架']);

  const build = sh(repo, 'node', ['mentors-den/scripts/build-course-html.js']);
  assert.strictEqual(build.status, 0, '构建失败：' + (build.stderr || build.stdout));
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'chore(course): 重建静态课程产物']);

  const firstPush = sh(repo, 'git', ['push', 'origin', 'HEAD:refs/heads/main']);
  assert.strictEqual(firstPush.status, 0,
    '基线 push 应成功，stderr: ' + (firstPush.stderr || firstPush.stdout));

  return { repo, remote, courseMd };
}

/**
 * 在源里造一个「正文指针指向不存在的课时 ID」⇒ 触发遗留清单分支（L75 那行 echo）。
 *
 * ⚠️ 指针必须**不带**「原」前缀：scanner 的 is_historical_ref() 对「原 X」/「（现 …）」
 *    判为**有意指向旧课时** ⇒ 直接豁免、不进遗留清单 ⇒ 分支根本不触发（实测踩过）。
 *    这里用「（详见 W99-L01 的说明）」——无「原」、ID 后无「（现」⇒ 命中报告清单。
 * ⚠️ 不用 .py 文件名形态：那种是**致命**悬空（会拦 push），会把「闸崩」和「闸拦」混在一起。
 *    本测试要的是「只报不改」的那条路径（L75）。
 */
function injectDanglingPointer(repo, courseMd) {
  fs.writeFileSync(courseMd,
    '# W01-L01 · 合成课时\n\n本周我们做一个练习。\n\n（详见 W99-L01 的说明）\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'docs(course): 造一个悬空正文指针']);
  // ★ 必须重建产物：否则漂移闸（section 3）会先拒 ⇒ 把「闸崩」误判成「闸拦」。
  const build = sh(repo, 'node', ['mentors-den/scripts/build-course-html.js']);
  assert.strictEqual(build.status, 0,
    '重建产物失败：' + (build.stderr || build.stdout));
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'chore(course): 重建静态课程产物']);
}

test('① 现版钩子 + 悬空正文指针 ⇒ push 成功（闸不崩）且无 unbound variable', () => {
  const hookBody = fs.readFileSync(HOOK, 'utf8');
  const { repo, remote, courseMd } = makeRepo('fixed', hookBody);
  injectDanglingPointer(repo, courseMd);

  const before = git(remote, ['log', '-1', '--pretty=%h %s']).trim();
  const push = sh(repo, 'git', ['push', 'origin', 'HEAD:refs/heads/main']);
  const out = push.stdout + push.stderr;

  assert.ok(!/unbound variable/.test(out),
    '闸崩了（unbound variable）⇒ 修法没生效或还有别处裸 $var。输出：\n' + out);
  assert.strictEqual(push.status, 0,
    '误拒：悬空正文指针只报不改、不拦 push，却把 push 拒了。输出：\n' + out);
  assert.notStrictEqual(git(remote, ['log', '-1', '--pretty=%h %s']).trim(), before,
    '远端 tip 没前进 ⇒ push 没生效');
});

test('② 回归见证：修复前的裸 $label 版钩子 + 同样场景 ⇒ 崩（unbound variable）', () => {
  // 用**修复前的原件**（从 HEAD 取历史版本），而不是正则改写现版。
  const legacy = spawnSync('git', ['show', 'origin/main:.githooks/pre-push'], {
    cwd: REPO_ROOT, encoding: 'utf8', env: GIT_ENV,
  });
  if (legacy.status !== 0 || !legacy.stdout.includes('$label，')) {
    // origin/main 已被修过时，用「现版 + 手工退回裸 $label」构造等价旧版
    const cur = fs.readFileSync(HOOK, 'utf8');
    const broke = cur.replace(/\$\{label\}/g, '$label');
    assert.ok(broke.includes('$label，'),
      '构造不出带裸 $label 的旧版钩子 ⇒ 本测试分辨不出新旧');
    testOldHook(broke);
    return;
  }
  testOldHook(legacy.stdout);
});

function testOldHook(brokenHook) {
  const { repo, remote, courseMd } = makeRepo('broken', brokenHook);
  injectDanglingPointer(repo, courseMd);

  const push = sh(repo, 'git', ['push', 'origin', 'HEAD:refs/heads/main']);
  const out = push.stdout + push.stderr;
  assert.ok(/unbound variable/.test(out),
    '旧版（裸 $label）居然没崩 ⇒ 本测试分辨不出新旧，① 的通过可能是别的原因。输出：\n' + out);
  assert.notStrictEqual(push.status, 0, '旧版居然放行了？');
  assert.ok(remote, '远端句柄');
}

test('③ 静态扫描：钩子里不得再有「裸 $var 紧跟非 ASCII 标点」（防同类复发）', () => {
  const hookBody = fs.readFileSync(HOOK, 'utf8');
  const lines = hookBody.split('\n');
  const offenders = [];
  lines.forEach((line, i) => {
    if (line.trim().startsWith('#')) return;   // 注释不算
    // 裸 $var 后面紧跟非 ASCII 字节 ⇒ bash 会把那些字节当变量名的一部分
    const m = line.match(/\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]/);
    if (m) offenders.push(`L${i + 1}: ${line.trim()}  ← 命中 ${JSON.stringify(m[0])}`);
  });
  assert.deepStrictEqual(offenders, [],
    '钩子里还有「裸 $var + 非 ASCII 标点」的写法（bash 会把全角字节当变量名 ⇒ set -u 崩溃）：\n' +
    offenders.join('\n'));
});
