#!/usr/bin/env node
/**
 * learning-publish.js — 发布某周课程到 TPG HQ KV
 *
 * 用法（从 sand-hollow 仓根目录跑）：
 *   SKYCLAN_CONFIG=~/projects/skyclan/projects/chatroom/config.json \
 *     node mentors-den/scripts/learning-publish.js W01
 *
 * 数据源：mentors-den/course/<WEEK>-*.md（沙坑仓内自包含）
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

const WEEK = process.argv[2];
if (!WEEK || !/^W\d+$/.test(WEEK)) {
  console.error('用法: SKYCLAN_CONFIG=<config.json 路径> node learning-publish.js <周ID，如 W01>');
  process.exit(1);
}

// 沙坑仓自包含：COURSE_DIR 相对本脚本位置（mentors-den/scripts/ → ../course）
const COURSE_DIR = path.join(__dirname, '..', 'course');

// 凭据走环境变量（不存公开仓）：SKYCLAN_CONFIG 指向 chatroom 仓的 config.json
const CONFIG_PATH = process.env.SKYCLAN_CONFIG
  || path.join(os.homedir(), 'projects', 'skyclan', 'projects', 'chatroom', 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  console.error(`❌ 找不到 config.json: ${CONFIG_PATH}`);
  console.error(`   用 SKYCLAN_CONFIG=<路径> 环境变量指定`);
  process.exit(1);
}
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const BASE = process.env.SKYCLAN_BASE_URL || 'https://tpg-hq.thawflow.com';

// 1. 周标题：SYLLABUS 里 "### W01 · 起步：让程序开口说话"
const syllabus = fs.readFileSync(path.join(COURSE_DIR, 'SYLLABUS.md'), 'utf8');
const m = syllabus.match(new RegExp(`### ${WEEK} · (.+)`));
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

const body = JSON.stringify({ week_id: WEEK, title: weekTitle, lessons });

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
