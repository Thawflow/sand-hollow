'use strict';
/**
 * .githooks/pre-push 的测试（防漂移闸 · 2026-10-31）
 *
 * 跑法：node --test mentors-den/tests/
 *
 * 覆盖冰爪 10-31 实测的**洞 A**（pre-push 远端基线解析假绿）：
 *   git push 传给 pre-push 的 $2 是**远端名/远端 URL 或路径**，不是 sha。
 *   旧写法 `git rev-parse "$REMOTE_REF"` 对这类输入会把参数原样打到 stdout
 *   且 rc=128，被 `2>/dev/null || true` 吞掉 rc ⇒ REMOTE_SHA = 垃圾字符串（非空）
 *   ⇒ merge-base 回落不触发 ⇒ RANGE="<garbage>..HEAD" ⇒ git diff 报错、stdout 空
 *   ⇒ MD_CHANGED 恒空 ⇒ **exit 0 放行**（源改了、产物没重建，照样 push 成功）。
 *   修法：`--verify --quiet` 对非 ref 输入返空 + rc≠0 ⇒ 正确触发基线回落。
 *
 * ⚠️ 验收口径（冰爪 10-31 09:37 纠正）：**必须用真 `git push` 验收**，
 *   不能手工 `bash .githooks/pre-push <args>` 跑 —— 两条路径不等价：
 *   真 push 时 git 自己决定 $1/$2 传什么，且会带上远端跟踪引用；
 *   手工跑传的是自己编的参数，走的回落分支可能与真 push 不同。
 *   所以本文件一律用 `git push` 触发钩子。
 *
 * 断言：
 *   ① 现版钩子 + 源改了没重建 ⇒ push 必须失败，远端 tip 不前进
 *   ② 现版钩子 + 源改了且重建 ⇒ push 必须成功（不误伤）
 *   ③ 旧版钩子（把 --verify 那行改回去）+ 源改了没重建 ⇒ push 会成功
 *      —— 这条是**回归见证**：证明本测试真能分辨新旧，否则 ① 可能因为别的原因通过
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HOOK = path.join(REPO_ROOT, '.githooks', 'pre-push');
// 修复前的钩子原件（回归见证用）：真实仓修复前的那一版
const LEGACY_HOOK = path.join(__dirname, 'fixtures', 'pre-push-legacy.sh');

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

function sh(cwd, cmd, args) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8', env: GIT_ENV });
}

/**
 * 隔离仓：bare 远端 + 工作副本（含钩子 / 构建脚本 / marked vendor / 一课内容）。
 * 课程文件名用真实仓的命名形态（W01-L01.md）。
 */
function makeRepo(tag, hookBody) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sand-hollow-hook-' + tag + '-'));
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

  fs.copyFileSync(path.join(REPO_ROOT, 'mentors-den', 'scripts', 'build-course-html.js'),
    path.join(repo, 'mentors-den', 'scripts', 'build-course-html.js'));
  fs.copyFileSync(path.join(REPO_ROOT, 'mentors-den', 'scripts', 'scan-week-refs.py'),
    path.join(repo, 'mentors-den', 'scripts', 'scan-week-refs.py'));
  fs.copyFileSync(path.join(REPO_ROOT, 'docs', 'vendor', 'marked.min.js'),
    path.join(repo, 'docs', 'vendor', 'marked.min.js'));
  fs.writeFileSync(path.join(repo, '.githooks', 'pre-push'), hookBody);
  fs.chmodSync(path.join(repo, '.githooks', 'pre-push'), 0o755);

  // 一课内容（标题合规，避免构建期标题闸拦下）
  fs.writeFileSync(path.join(repo, 'mentors-den', 'course', 'SYLLABUS.md'),
    '# 家庭编程课 · 完整大纲（测试用）\n\n### W01 · 起步：让程序开口说话\n');
  const courseMd = path.join(repo, 'mentors-den', 'course', 'W01-L01.md');
  fs.writeFileSync(courseMd, '# W01-L01 · 合成课时\n\n本周我们做一个练习。\n');

  git(repo, ['config', 'core.hooksPath', '.githooks']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'chore: 课程骨架']);

  // 重建产物并提交 ⇒ 基线一致
  const build = sh(repo, 'node', ['mentors-den/scripts/build-course-html.js']);
  assert.strictEqual(build.status, 0, '构建失败：' + (build.stderr || build.stdout));
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'chore(course): 重建静态课程产物']);

  // 基线先推上去（此时源与产物一致 ⇒ 钩子应放行）
  const firstPush = sh(repo, 'git', ['push', 'origin', 'HEAD:refs/heads/main']);
  assert.strictEqual(firstPush.status, 0,
    '基线 push 应成功，stderr: ' + (firstPush.stderr || firstPush.stdout));

  return { repo, remote, courseMd };
}

function remoteTip(remote) {
  return git(remote, ['log', '-1', '--pretty=%h %s']).trim();
}

test('① 现版钩子 + 真 push + 源改了没重建 ⇒ 必须拒（远端 tip 不前进）', () => {
  const hookBody = fs.readFileSync(HOOK, 'utf8');
  const { repo, remote, courseMd } = makeRepo('drift', hookBody);

  const before = remoteTip(remote);
  fs.writeFileSync(courseMd, '# W01-L01 · 合成课时\n\n本周我们做一个练习。\n\n补一段新内容。\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'docs(course): 改了源但没重建产物']);

  const push = sh(repo, 'git', ['push', 'origin', 'HEAD:refs/heads/main']);
  assert.notStrictEqual(push.status, 0,
    '假绿！真 push 下闸没设防（期望拒，非 0）。stdout: ' + push.stdout + ' stderr: ' + push.stderr);
  assert.ok(/防漂移|产物与源不一致|落后/.test(push.stderr + push.stdout),
    '拒绝理由不是防漂移闸：' + push.stderr + push.stdout);
  assert.strictEqual(remoteTip(remote), before, '远端 tip 前进了 ⇒ 漂移 commit 进了远端');
});

test('② 现版钩子 + 真 push + 源改了且重建产物 ⇒ 必须放行（不误伤）', () => {
  const hookBody = fs.readFileSync(HOOK, 'utf8');
  const { repo, remote, courseMd } = makeRepo('ok', hookBody);

  const before = remoteTip(remote);
  fs.writeFileSync(courseMd, '# W01-L01 · 合成课时\n\n本周我们做一个练习。\n\n补一段新内容。\n');
  const build = sh(repo, 'node', ['mentors-den/scripts/build-course-html.js']);
  assert.strictEqual(build.status, 0, '构建失败：' + (build.stderr || build.stdout));
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'docs(course): 改源并重建产物']);

  const push = sh(repo, 'git', ['push', 'origin', 'HEAD:refs/heads/main']);
  assert.strictEqual(push.status, 0,
    '误拒：产物已重建应放行。stdout: ' + push.stdout + ' stderr: ' + push.stderr);
  assert.notStrictEqual(remoteTip(remote), before, '远端 tip 没前进 ⇒ push 没生效');
});

test('③ 回归见证：旧版钩子（修复前原件）+ 真 push + 漂移 ⇒ 会放行（本测试真能分辨新旧）', () => {
  // 用**修复前的原件**（fixtures/pre-push-legacy.sh = 修复前的 .githooks/pre-push），
  // 而不是正则改写现版 —— 正则改写容易只改到一半、测出个"半旧半新"的假象。
  const legacy = fs.readFileSync(LEGACY_HOOK, 'utf8');
  assert.ok(!legacy.includes('--verify'), 'fixture 不是修复前版本（含 --verify）');
  assert.ok(legacy.includes('git rev-parse "$REMOTE_REF"'), 'fixture 里找不到旧的 rev-parse 写法');

  const { repo, remote, courseMd } = makeRepo('legacy', legacy);
  const before = remoteTip(remote);
  fs.writeFileSync(courseMd, '# W01-L01 · 合成课时\n\n本周我们做一个练习。\n\n补一段新内容。\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'docs(course): 改了源但没重建产物（旧版钩子）']);

  const push = sh(repo, 'git', ['push', 'origin', 'HEAD:refs/heads/main']);
  assert.strictEqual(push.status, 0,
    '旧版钩子居然拦住了 ⇒ 本测试分辨不出新旧，① 的通过可能是别的原因。stderr: ' + push.stderr);
  assert.notStrictEqual(remoteTip(remote), before, '旧版钩子下远端 tip 没前进 ⇒ 漂移没进远端（说明另有原因挡住了）');
});

test('④ 仓根锚定（防御性）：手工从子目录调用钩子，仍按仓根解析路径', () => {
  // 口径订正（冰爪 10-31 10:22 独立实测 + 我方 /tmp/cwdtest 探针 HOOK_PWD 复核）：
  //   **git 跑 push 钩子前会 chdir 回工作树根** ⇒ 真 push 时 cwd 本来就是仓根，
  //   所以「cwd 变化 ⇒ pathspec 匹配不到 ⇒ MD_CHANGED 空」在真 push 路径上**不成立**。
  //   ⇒ 本处锚定是**防御性加固**（覆盖「手工从子目录调用钩子」这条非-git 路径），不是堵活洞。
  //   真活洞 = 「只改 docs/course/*.html（源不动）⇒ 闸不跑」⇒ 由测试 ⑥ 闭环。
  const hookBody = fs.readFileSync(HOOK, 'utf8');
  const { repo, courseMd } = makeRepo('cwd', hookBody);

  // 改源、**不**重建产物 ⇒ 应当被拦
  fs.writeFileSync(courseMd, '# W01-L01 · 合成课时\n\n本周我们做一个练习。\n\n补一段新内容。\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'docs(course): 改了源但没重建产物']);

  // 从**子目录**调用钩子（cwd ≠ 仓根）：pathspec 若按 cwd 解析就匹配不到 mentors-den/course/*.md
  // ⇒ MD_CHANGED 空 ⇒ 第 2 步 exit 0 假绿。仓根锚定后必须照样拦得住。
  const sub = path.join(repo, 'docs', 'course');
  const r = sh(sub, 'bash', [path.join(repo, '.githooks', 'pre-push'), 'HEAD', 'origin/main']);
  assert.notStrictEqual(r.status, 0,
    '假绿！从子目录调用时闸没设防（期望拒，非 0）。stdout: ' + r.stdout + ' stderr: ' + r.stderr);
  assert.ok(/防漂移|产物与源不一致|落后/.test(r.stdout + r.stderr),
    '拒绝理由不是防漂移闸：' + r.stdout + r.stderr);
});

test('⑤ 远端基线拿不到（首次 push 到新远端）⇒ 不跳过，改全量比对：产物落后仍拒', () => {
  // 场景：远端还没有任何 ref（首次 push / 新远端）⇒ 旧写法直接 exit 0 放行（跳过检查）。
  // 新写法：基线未知 ⇒ 改为「全量比对」（重建产物 vs 仓内产物）⇒ 照样拦得住漂移。
  const hookBody = fs.readFileSync(HOOK, 'utf8');
  const { repo, remote, courseMd } = makeRepo('nobase', hookBody);

  // 造「远端基线拿不到」：换一个**空的新远端**（无任何 ref）+ 删掉本地 origin/main 跟踪引用
  // （这样钩子里的 merge-base HEAD origin/main 也会失败 ⇒ 真正走到 RANGE_UNKNOWN 全量比对分支）
  const fresh = path.join(path.dirname(remote), 'fresh-remote.git');
  git(path.dirname(remote), ['init', '--bare', fresh]);
  git(repo, ['remote', 'add', 'fresh', fresh]);
  git(repo, ['update-ref', '-d', 'refs/remotes/origin/main']);

  // 改源、**不**重建产物 ⇒ 全量比对应发现产物落后
  fs.writeFileSync(courseMd, '# W01-L01 · 合成课时\n\n本周我们做一个练习。\n\n补一段新内容。\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'docs(course): 改了源但没重建产物（远端无基线）']);

  const r = sh(repo, 'git', ['push', 'fresh', 'HEAD:refs/heads/main']);
  assert.notStrictEqual(r.status, 0,
    '假绿！远端无基线时闸直接跳过（期望拒，非 0）。stdout: ' + r.stdout + ' stderr: ' + r.stderr);
  assert.ok(/基线|全量|防漂移|产物与源不一致|落后/.test(r.stdout + r.stderr),
    '拒绝理由不对：' + r.stdout + r.stderr);
});

test('⑥ 活洞闭环：从子目录真 push + 只改产物 HTML 带串号 ⇒ 现版必拒、旧版放行', () => {
  // 场景 = 本轮定性的**真活洞**：只改 docs/course/*.html（源不动）⇒ 2330aaa 版第 2 步
  // MD_CHANGED 空就 exit 0 放行，串号直进远端（冰爪 10-31 独立实测 + 我方 /tmp/cwdtest 复现 rc=0）。
  // 现版靠「串号闸无条件跑（源 + 产物两扫）」堵住；旧版（修复前原件）必然放行 ⇒ 证明本测试真能分辨。
  //
  // 注：cwd 一律从 docs/course/ 子目录起（git 跑钩子前会 chdir 回工作树根，
  // 所以这测的是「子目录发起 push」这个真实入口，不是手工从子目录调钩子）。
  const hookBody = fs.readFileSync(HOOK, 'utf8');
  const { repo, remote, courseMd } = makeRepo('htmlonly', hookBody);

  // 先让产物里真有一个 .py 文件名（fixture 源本来没有 .py 引用）⇒ 走真实构建产出
  fs.writeFileSync(courseMd, '# W01-L01 · 合成课时\n\n本周我们做一个练习。\n\n存为 W01-L01-homework.py\n');
  const build0 = sh(repo, 'node', ['mentors-den/scripts/build-course-html.js']);
  assert.strictEqual(build0.status, 0, '构建失败：' + (build0.stderr || build0.stdout));
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'docs(course): 源里加一个 .py 文件名并重建产物']);

  // 再**只改产物 HTML**（手改串号），源 md 不动 ⇒ 这就是活洞场景
  const prod = path.join(repo, 'docs', 'course', 'W01.html');
  fs.writeFileSync(prod, fs.readFileSync(prod, 'utf8').replace(/W01-L01-homework\.py/g, 'W16-S9-homework.py'));
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'chore(course): 手改产物 HTML 带串号（源未动）']);

  const remoteBefore = git(remote, ['rev-parse', 'refs/heads/main']).trim();
  const r = sh(path.join(repo, 'docs', 'course'), 'git', ['push', 'origin', 'HEAD:refs/heads/main']);
  assert.notStrictEqual(r.status, 0,
    '假绿！只改产物 HTML 带串号竟被放行（期望拒，非 0）。stdout: ' + r.stdout + ' stderr: ' + r.stderr);
  assert.ok(/串号|产物|docs\/course/.test(r.stdout + r.stderr),
    '拒绝理由不是产物面串号闸：' + r.stdout + r.stderr);
  assert.strictEqual(git(remote, ['rev-parse', 'refs/heads/main']).trim(), remoteBefore,
    '远端 tip 前进了 ⇒ 串号 commit 进了远端');

  // 反向对照：同一场景换成**修复前原件**（旧版钩子）⇒ 必然放行、串号进远端
  // ⇒ 证明本测试真能分辨新旧（否则上面的「拒」可能因别的原因通过）
  const legacy = fs.readFileSync(LEGACY_HOOK, 'utf8');
  const b = makeRepo('htmlonly-legacy', legacy);
  fs.writeFileSync(b.courseMd, '# W01-L01 · 合成课时\n\n本周我们做一个练习。\n\n存为 W01-L01-homework.py\n');
  const bld = sh(b.repo, 'node', ['mentors-den/scripts/build-course-html.js']);
  assert.strictEqual(bld.status, 0, '构建失败：' + (bld.stderr || bld.stdout));
  git(b.repo, ['add', '-A']);
  git(b.repo, ['commit', '-m', 'docs(course): 源里加一个 .py 文件名并重建产物']);
  const bprod = path.join(b.repo, 'docs', 'course', 'W01.html');
  fs.writeFileSync(bprod, fs.readFileSync(bprod, 'utf8').replace(/W01-L01-homework\.py/g, 'W16-S9-homework.py'));
  git(b.repo, ['add', '-A']);
  git(b.repo, ['commit', '-m', 'chore(course): 手改产物 HTML 带串号（源未动）']);
  const r2 = sh(path.join(b.repo, 'docs', 'course'), 'git', ['push', 'origin', 'HEAD:refs/heads/main']);
  assert.strictEqual(r2.status, 0,
    '旧版钩子居然拦住了 ⇒ 本测试分辨不出新旧。stdout: ' + r2.stdout + ' stderr: ' + r2.stderr);
  assert.notStrictEqual(git(b.remote, ['rev-parse', 'refs/heads/main']).trim(),
    git(b.remote, ['rev-parse', 'refs/heads/main~1']).trim(),
    '旧版下远端 tip 没前进 ⇒ 旧版也拦住了？');
});

test('⑦ 聚合文件覆盖：源 SYLLABUS.md 注入串号 + 重建产物 ⇒ 现版必拒、旧版放行', () => {
  // 冰爪 11:32 实测：旧 glob 只认 W*.md / W*.html ⇒ 聚合文件全漏
  //   （源侧 SYLLABUS.md、产物侧 syllabus.html + index.json），
  //   实测「往 syllabus.html 注入串号 → PUSH_RC=0、远端实进 1 处」。
  // 现版：源与产物两侧都扫全部课程文件；聚合文件按**所在周次分节**判归属。
  const hookBody = fs.readFileSync(HOOK, 'utf8');
  const { repo, courseMd } = makeRepo('agg-src', hookBody);

  // 源侧聚合文件 SYLLABUS.md 注入串号（源不动 ⇒ 漂移闸会认为源与产物一致，必须靠串号闸拦）
  const syl = path.join(repo, 'mentors-den', 'course', 'SYLLABUS.md');
  fs.writeFileSync(syl, fs.readFileSync(syl, 'utf8') + '\n新建 `W16-S9-homework.py`\n');
  const build = sh(repo, 'node', ['mentors-den/scripts/build-course-html.js']);
  assert.strictEqual(build.status, 0, '构建失败：' + (build.stderr || build.stdout));
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'docs(course): 聚合文件 SYLLABUS.md 注入串号并重建产物']);

  const r = sh(repo, 'git', ['push', 'origin', 'HEAD:refs/heads/main']);
  assert.notStrictEqual(r.status, 0,
    '假绿！聚合文件（SYLLABUS.md）带串号竟被放行（期望拒，非 0）。stdout: ' + r.stdout + ' stderr: ' + r.stderr);
  assert.ok(/串号|mentors-den\/course/.test(r.stdout + r.stderr),
    '拒绝理由不是串号闸：' + r.stdout + r.stderr);
});

test('⑧ 判的是「被推的那份」：HEAD 干净但工作树脏 ⇒ 放行；HEAD 脏但工作树干净 ⇒ 拒', () => {
  // 冰爪 11:32 §五：闸必须验「扫的是不是被推的那份」——
  //   旧写法扫工作树 ⇒ HEAD 有病而工作树干净时永远绿（洞），且工作树有 unrelated 脏改动时误伤。
  const hookBody = fs.readFileSync(HOOK, 'utf8');

  // 场景 A：工作树脏（本地改了源，**没提交**）⇒ 被推的那份是干净的 ⇒ 必须放行（不误伤）
  {
    const { repo, courseMd } = makeRepo('pushed-a', hookBody);
    fs.writeFileSync(courseMd, '# W01-L01 · 合成课时\n\n本周我们做一个练习。\n\n本地未提交的改动。\n');
    const r = sh(repo, 'git', ['push', 'origin', 'HEAD:refs/heads/main']);
    assert.strictEqual(r.status, 0,
      '误伤！工作树有未提交改动就被拦（被推的那份是干净的）。stdout: ' + r.stdout + ' stderr: ' + r.stderr);
  }

  // 场景 B：HEAD 有串号（已提交）+ **工作树被还原干净** ⇒ 被推的那份有病 ⇒ 必须拒
  {
    const { repo, remote, courseMd } = makeRepo('pushed-b', hookBody);
    // 先让源里出现 .py 文件名并重建产物 ⇒ 产物里有 W01-L01-homework.py 可换
    fs.writeFileSync(courseMd, '# W01-L01 · 合成课时\n\n本周我们做一个练习。\n\n存为 W01-L01-homework.py\n');
    const build0 = sh(repo, 'node', ['mentors-den/scripts/build-course-html.js']);
    assert.strictEqual(build0.status, 0, '构建失败：' + (build0.stderr || build0.stdout));
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'docs(course): 源里加 .py 文件名并重建产物']);
    // 再把**产物**改成串号并提交 ⇒ HEAD 带串号
    const prod = path.join(repo, 'docs', 'course', 'W01.html');
    fs.writeFileSync(prod, fs.readFileSync(prod, 'utf8').replace(/W01-L01-homework\.py/g, 'W16-S9-homework.py'));
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'chore: 产物带串号（已提交）']);
    // 把工作树还原成**干净**内容（HEAD 仍带串号）⇒ 旧写法扫工作树会报绿。
    // ⚠️ 不能用 `git checkout -- <path>`：那是从**索引**恢复，索引里正是刚提交的串号版本 ⇒ 等于没还原。
    //    要从上一笔 commit 取干净内容写回工作树。
    const clean = git(repo, ['show', 'HEAD~1:docs/course/W01.html']);
    fs.writeFileSync(prod, clean);
    assert.ok(!fs.readFileSync(prod, 'utf8').includes('W16-S9-homework.py'), '工作树没还原干净');
    assert.ok(git(repo, ['show', 'HEAD:docs/course/W01.html']).includes('W16-S9-homework.py'), 'HEAD 里串号没了？');

    const before = git(remote, ['rev-parse', 'refs/heads/main']).trim();
    const r = sh(repo, 'git', ['push', 'origin', 'HEAD:refs/heads/main']);
    assert.notStrictEqual(r.status, 0,
      '假绿！HEAD 带串号、工作树干净时被放行（扫的不是被推的那份）。stdout: ' + r.stdout + ' stderr: ' + r.stderr);
    assert.strictEqual(git(remote, ['rev-parse', 'refs/heads/main']).trim(), before,
      '远端 tip 前进了 ⇒ 串号 commit 进了远端');
  }
});

// ── 2026-10-31（冰爪红格：algopedia 双盲区）────────────────────────────────
// 洞 D：嵌套讲义（course/algopedia/）旧版**完全不进扫描**（扫描器只列顶层）
// 洞 E：课时改名后，引用**已不存在**的课时 ID 旧版查不出来
test('⑨ 嵌套讲义里引用已不存在的课时 ID ⇒ 真 push 必须拒（洞 D+E：algopedia 曾是双盲区）', () => {
  const hookBody = fs.readFileSync(HOOK, 'utf8');
  const { repo, remote } = makeRepo('algopedia', hookBody);

  const before = remoteTip(remote);
  // 嵌套目录里的讲义：点名一个**不存在的**课时（W13-L03 已改名为 W17-L03）
  fs.mkdirSync(path.join(repo, 'mentors-den', 'course', 'algopedia'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'mentors-den', 'course', 'algopedia', 'binary-big-o.md'),
    '# W01-L01 · 快慢的度量：数据翻倍\n\n存为 `W13-L03-homework.py`\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'docs(course): 嵌套讲义引用已改名的课时 ID']);

  const push = sh(repo, 'git', ['push', 'origin', 'HEAD:refs/heads/main']);
  assert.notStrictEqual(push.status, 0,
    '假绿！嵌套讲义里的悬空课时 ID 被放行了。stdout: ' + push.stdout + ' stderr: ' + push.stderr);
  assert.ok(/串号|悬空课时|不存在的课时/.test(push.stderr + push.stdout),
    '拒绝理由不是串号/悬空课时闸：' + push.stderr + push.stdout);
  assert.strictEqual(remoteTip(remote), before, '远端 tip 前进了 ⇒ 悬空引用的 commit 进了远端');
});

test('⑩ 嵌套讲义内容自洽 ⇒ 真 push 放行（递归覆盖不误伤）', () => {
  const hookBody = fs.readFileSync(HOOK, 'utf8');
  const { repo, remote } = makeRepo('algopedia-ok', hookBody);

  const before = remoteTip(remote);
  fs.mkdirSync(path.join(repo, 'mentors-den', 'course', 'algopedia'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'mentors-den', 'course', 'algopedia', 'binary-big-o.md'),
    '# W01-L01 · 快慢的度量：数据翻倍\n\n存为 `W01-L01-homework.py`\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'docs(course): 嵌套讲义内容自洽']);

  const push = sh(repo, 'git', ['push', 'origin', 'HEAD:refs/heads/main']);
  assert.strictEqual(push.status, 0,
    '误拒：内容自洽的嵌套讲义应放行。stdout: ' + push.stdout + ' stderr: ' + push.stderr);
  assert.notStrictEqual(remoteTip(remote), before, '远端 tip 没前进 ⇒ push 没生效');
});
