#!/usr/bin/env node
/**
 * learning-publish.js — 发布某周课程到 TPG HQ KV
 *
 * 用法（从 sand-hollow 仓根目录跑）：
 *   node mentors-den/scripts/learning-publish.js W01
 *   （凭据默认从 ~/.config/skyclan-chatroom/config.json 取；也可用 SKYCLAN_CONFIG=<路径> 覆盖）
 *
 * 数据源：mentors-den/course/<WEEK>-*.md（编程轨 code）
 *         mentors-den/phonics/<WEEK>-*.md（英语音标轨 phonics，2026-10-26 新增）
 * 轨选择：COURSE_TRACK=code|phonics 环境变量，或按周号前缀自动推断（W*→code，P*→phonics）
 * 行为：读 SYLLABUS 提取周标题 + 读所有课时 md → POST /learning/publish（覆盖式）
 *
 * Schema 见 docs/LEARNING-TAB-PRD.md §4/§5
 *
 * 历史：v1.5 之前在 ~/.openclaw/workspace/life/programming-course/；
 *       之后放 skyclan-chatroom 仓（凑 tpg-hq API 客户端）；
 *       2026-10-19 猴哥指示："沙坑的脚本应该放入沙坑项目自身的仓库"
 *       → 搬入 mentors-den/scripts/，凭据走环境变量 SKYCLAN_CONFIG 指向外部
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// 2026-10-26 多课程轨：W* = 编程轨（code），P* = 英语音标轨（phonics）
// 轨可用 COURSE_TRACK 环境变量显式指定；不指定时按周号前缀自动推断。
// ★ 旗标位置无关：argv 里第一个匹配 /^[A-Z]\d+$/ 的参数当周ID
//   （--check-only / --allow-divergent 放周ID前后都行 —— 位置写死会误判成「用法」并静默退 0）
const argvAll = process.argv.slice(2);
const WEEK = argvAll.find(a => /^[A-Z]\d+$/.test(a));
const CHECK_ONLY = argvAll.includes('--check-only');
const ALLOW_DIVERGENT = argvAll.includes('--allow-divergent');
const TRACK = (process.env.COURSE_TRACK || (WEEK && /^P/.test(WEEK) ? 'phonics' : 'code'))
  .replace(/[^a-z0-9_-]/gi, '') || 'code';
if (!WEEK) {
  console.error('用法: SKYCLAN_CONFIG=<config.json 路径> node learning-publish.js <周ID，如 W01 或 P01> [--check-only] [--allow-divergent]');
  console.error('  音标轨: COURSE_TRACK=phonics node learning-publish.js P01');
  console.error('  --check-only：只跑发布前对账，不发布');
  console.error('  --allow-divergent：跳过对账强制发布（须留痕，默认关）');
  process.exit(1);
}

// 沙坑仓自包含：COURSE_DIR 相对本脚本位置（mentors-den/scripts/ → ../course）
// 课程目录按轨选择（2026-10-26 多课程轨）
//  - code 轨   → mentors-den/course/     （编程 W01-W17）
//  - phonics 轨 → mentors-den/phonics/    （英语音标 P00-P08）
const COURSE_DIR = TRACK === 'phonics'
    ? path.join(__dirname, '..', 'phonics')
    : path.join(__dirname, '..', 'course');

// 凭据走环境变量（不存公开仓）：SKYCLAN_CONFIG 指向 config.json
// ★ 修：默认路径原本写死 `~/projects/skyclan/projects/chatroom/config.json`，
//   但那个文件已随运行时迁到 XDG 家（仓内只留 placeholder）→ 默认路径**指向不存在的文件**，
//   脚本在没设 SKYCLAN_CONFIG 时直接退 1「找不到 config.json」（沙坑 skill 文档也记着这条：
//   「脚本内默认 config 路径已失效」）。此处补 XDG 回落链，与 skyclan 侧 v1.6 同款。
const CONFIG_CANDIDATES = [
  process.env.SKYCLAN_CONFIG,
  path.join(os.homedir(), '.config', 'skyclan-chatroom', 'config.json'),
  path.join(os.homedir(), 'projects', 'skyclan', 'projects', 'chatroom', 'config.json'),
].filter(Boolean);
const CONFIG_FILE = CONFIG_CANDIDATES.find(c => { try { return fs.statSync(c).isFile(); } catch (_) { return false; } });
if (!CONFIG_FILE) {
  console.error('❌ 找不到 config.json。试过：\n' + CONFIG_CANDIDATES.map(c => '  - ' + c).join('\n'));
  console.error('   用 SKYCLAN_CONFIG=<路径> 环境变量指定');
  process.exit(1);
}
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const BASE = process.env.SKYCLAN_BASE_URL || 'https://tpg-hq.thawflow.com';

// 1. 周标题：SYLLABUS 里 "### W01 · 起步：让程序开口说话"
const syllabusFile = TRACK === 'phonics' ? 'SYLLABUS-PHONICS.md' : 'SYLLABUS.md';
const syllabus = fs.readFileSync(path.join(COURSE_DIR, syllabusFile), 'utf8');
const m = syllabus.match(new RegExp(`### ${WEEK} · (.+)`))
             || syllabus.match(new RegExp(`## ${WEEK} · (.+)`));
if (!m) { console.error(`SYLLABUS 里没找到 ${WEEK}`); process.exit(1); }
const weekTitle = m[1].trim();

// 2. 课时文件：W01-L01.md / W01-weekend.md（存在即发布）
const files = fs.readdirSync(COURSE_DIR)
  .filter(f => new RegExp(`^${WEEK}-.+\\.md$`).test(f))
  .sort();
if (!files.length) { console.error(`${COURSE_DIR} 下没有 ${WEEK}-*.md`); process.exit(1); }

const lessons = files.map(f => {
  const md = fs.readFileSync(path.join(COURSE_DIR, f), 'utf8');
  const h = md.match(/^# (.+)$/m); // "W01-L01 · 认识终端 + 装 Thonny + 第一行代码"
  const title = h ? h[1].replace(/^[^·]+·\s*/, '').trim() : f;
  return { id: path.basename(f, '.md'), title, markdown: md };
});

// ── 发布前对账闸 ───────────────────────────────────────────────
// 上一轮分叉事故的病灶 = KV 走本脚本直推，**没经过 origin/main** → origin/main 被 force-push
// 覆盖后，KV 与 origin/main 就永久错开（当时 KV = 5 节制 S-files / origin/main = 3 节制
// L-files，0 S-files）。本闸 = publish 前逐字节比对本地稿 vs origin/main 同名文件，
// 不一致或 origin/main 缺失 → **拒绝发布**（rc=2）。
//
// ⚠️ 本闸只挡「KV 领先 origin/main」这一个方向（历史真实病灶）；
//    另一方向（origin/main 领先 KV = 拆课已 commit+push 但没 publish）由 republish 对账
//    cron 负责（见 README「发布前对账」一节），本脚本不覆盖。
// ⚠️ 逃生阀 `--allow-divergent`：确有意的「先发 KV 再补 push」场景显式开（须留痕），默认关。
// ⚠️ 课程目录不在 git 工作树内 → 跳过对账只警告，不阻断（别把非仓用法打死）。
function courseRepoRoot(dir) {
  let cur = dir;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(cur, '.git'))) return cur;
    const up = path.dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return null;
}
function gitOut(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (_) {
    return null;
  }
}
function verifyAgainstOrigin() {
  const repo = courseRepoRoot(COURSE_DIR);
  if (!repo) {
    console.warn('⚠️  对账跳过：' + COURSE_DIR + ' 不在 git 工作树内（无法比对 origin/main）');
    return { skipped: true, divergent: [], missing: [] };
  }
  // origin/main 的实际 ref（本地 ref 可能落后 → 先问远端）
  const remote = gitOut(['rev-parse', '--verify', 'origin/main'], repo);
  if (!remote) {
    console.warn('⚠️  对账跳过：' + repo + ' 无 origin/main ref（未 fetch 或非 git 仓）');
    return { skipped: true, divergent: [], missing: [] };
  }
  const divergent = [];
  const missing = [];
  for (const f of files) {
    const rel = path.relative(repo, path.join(COURSE_DIR, f)).split(path.sep).join('/');
    const upstream = gitOut(['show', 'origin/main:' + rel], repo);
    if (upstream === null) { missing.push(f); continue; }
    const local = fs.readFileSync(path.join(COURSE_DIR, f), 'utf8');
    const norm = s => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');
    if (norm(local) !== norm(upstream)) divergent.push(f);
  }
  return { skipped: false, repo, divergent, missing, remote: remote.trim() };
}

const verdict = verifyAgainstOrigin();
if (!verdict.skipped && (verdict.divergent.length || verdict.missing.length)) {
  const lines = [];
  lines.push('❌ publish 前对账失败 —— 本地稿与 origin/main 不一致，拒绝发布 ' + WEEK);
  lines.push('   仓：' + verdict.repo + '  origin/main=' + verdict.remote.slice(0, 7));
  if (verdict.divergent.length) {
    lines.push('   内容不一致（' + verdict.divergent.length + '）：' + verdict.divergent.join(', '));
  }
  if (verdict.missing.length) {
    lines.push('   origin/main 缺失（' + verdict.missing.length + '）：' + verdict.missing.join(', '));
  }
  lines.push('');
  lines.push('   原因：KV 领先 origin/main = 上一次分叉事故的复发路径（KV 直推不过 origin/main）。');
  lines.push('   修法：先 commit + push 本地稿到 origin/main，再跑本脚本。');
  lines.push('   逃生阀（须留痕）：--allow-divergent');
  console.error(lines.join('\n'));
  if (!ALLOW_DIVERGENT) process.exit(2);
  console.warn('⚠️  --allow-divergent 已开：本次强制发布（请在 diary / chatroom 留痕）');
} else if (!verdict.skipped) {
  console.log('✅ publish 前对账通过：' + files.length + ' 个课时文件与 origin/main 一致（' + verdict.remote.slice(0, 7) + '）');
}

if (CHECK_ONLY) {
  console.log('（--check-only：只对账，不发布）');
  process.exit(0);
}

const body = JSON.stringify({ week_id: WEEK, title: weekTitle, lessons, track: TRACK });

fetch(`${BASE}/learning/publish`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${CONFIG.api_token}`,
    'Content-Type': 'application/json'
  },
  body
}).then(async r => {
  const text = await r.text();
  console.log(`HTTP ${r.status}`);
  console.log(text);
  if (!r.ok) process.exit(1);
}).catch(e => { console.error(e.message); process.exit(1); });
