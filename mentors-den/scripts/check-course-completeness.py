#!/usr/bin/env python3
"""沙坑课程完整性检查 v3（猴哥 2026-10-19 指示全面纳入）
- AI 胶囊 + C++ 认脸（基础课必加，加餐 + W01/W02 豁免）
- frontmatter 完整性（每节必须有 slug + type）
- type 合法性（base / addon / project）
- slug 格式（kebab-case，不带 W##/week 数字）
- slug 唯一性（跨文件无重复）
- 文件标题 W## 一致（标题里的 W## 必须跟文件名一致）

用法：
  python3 check-course-completeness.py <course_dir>
  python3 check-course-completeness.py mentors-den/course
"""
import re
import sys
from pathlib import Path

# 检查模式
AI_PATTERN = re.compile(r'^## ⓪ 🤖 课前 AI 一分钟', re.M)
CPP_PATTERN = re.compile(r'^## 👀 C\+\+ 认脸时刻', re.M)
FRONTMATTER_PATTERN = re.compile(r'^<!--\s*slug:\s*(\S+?)(?:,\s*type:\s*(\S+?))?\s*-->\s*$', re.M)
TITLE_PATTERN = re.compile(r'^#\s+(W\d+)-([SL]\d+|weekend)', re.M)
VALID_TYPES = {'base', 'addon', 'project'}


def get_frontmatter(text: str):
    """读 frontmatter 字段 → (slug, type)"""
    m = FRONTMATTER_PATTERN.search(text)
    if m:
        return m.group(1), m.group(2) or 'base'
    return None, None


def check_slug_format(slug: str) -> list:
    """检查 slug 格式"""
    errors = []
    if not slug:
        return ['  ❌ slug 为空']
    if not re.match(r'^[a-z][a-z0-9-]*[a-z0-9]$', slug):
        errors.append(f'  ❌ slug 格式不对（小写 kebab-case）: {slug}')
    if re.match(r'^w\d+', slug):
        errors.append(f'  ❌ slug 用了 W## 前缀（永久稳定原则违反）: {slug}')
    if 'week' in slug.lower():
        errors.append(f'  ❌ slug 包含 "week"（与 W## 重复）: {slug}')
    if re.search(r'\d{2,}', slug):
        errors.append(f'  ❌ slug 包含数字编号（应主题命名）: {slug}')
    return errors


def check_title_consistency(text: str, filename: str) -> list:
    """检查文件标题 W## 跟文件名一致"""
    errors = []
    m = TITLE_PATTERN.search(text)
    if not m:
        return []  # 标题没匹配上，跳过（兼容）
    title_w, title_sec = m.group(1), m.group(2)
    file_w = filename.split('-')[0]
    file_sec = filename.split('-')[1].split('.')[0]
    if title_w != file_w or title_sec != file_sec:
        errors.append(f'  ❌ 标题里的 {title_w}-{title_sec} 跟文件名 {file_w}-{file_sec} 不一致')
    return errors


def check_file(file: Path) -> list:
    """返回错误列表（空列表 = 通过）"""
    text = file.read_text()
    errors = []

    # 1. frontmatter 完整性
    slug, ftype = get_frontmatter(text)
    if not slug:
        errors.append(f'  ❌ 缺 frontmatter（<!-- slug: xxx, type: xxx -->）')
        return errors  # 没 slug 其他检查无意义

    # 2. type 合法性
    if ftype not in VALID_TYPES:
        errors.append(f'  ❌ type 非法: {ftype}（应是 base/addon/project）')

    # 3. slug 格式
    errors.extend(check_slug_format(slug))

    # 4. AI 胶囊 + C++ 认脸（基础 + project 必加，加餐豁免；W01/W02 豁免）
    week = file.name.split('-')[0]
    if week in ('W01', 'W02'):
        pass  # W01/W02 豁免（猴哥 10/19）
    elif ftype in ('base', 'project'):
        if not AI_PATTERN.search(text):
            errors.append(f'  ❌ 缺 AI 胶囊（## ⓪ 🤖 课前 AI 一分钟）')
        if not CPP_PATTERN.search(text):
            errors.append(f'  ❌ 缺 C++ 认脸（## 👀 C++ 认脸时刻）')

    # 5. 文件标题 W## 一致
    errors.extend(check_title_consistency(text, file.name))

    return errors


def main():
    if len(sys.argv) < 2:
        course = Path('mentors-den/course')
    else:
        course = Path(sys.argv[1])

    if not course.exists():
        print(f'❌ 课程目录不存在: {course}')
        sys.exit(2)

    files = sorted(course.glob('W*-S*.md')) + sorted(course.glob('W*-L*.md')) + sorted(course.glob('W*-weekend.md'))
    if not files:
        print(f'❌ 课程目录无文件: {course}')
        sys.exit(2)

    all_errors = []
    slug_usage = {}  # slug → [filenames]
    type_stats = {'base': 0, 'project': 0, 'addon': 0, 'unknown': 0}

    for f in files:
        text = f.read_text()
        slug, ftype = get_frontmatter(text)
        if slug:
            slug_usage.setdefault(slug, []).append(f.name)
        type_stats[ftype if ftype in VALID_TYPES else 'unknown'] += 1
        all_errors.extend(check_file(f))

    # 6. slug 唯一性
    for slug, fnames in slug_usage.items():
        if len(fnames) > 1:
            all_errors.append(f'  ❌ slug "{slug}" 重复出现在: {", ".join(fnames)}')

    checked = type_stats['base'] + type_stats['project']
    print(f'📋 沙坑课程完整性检查 v3')
    print(f'   课程目录: {course}')
    print(f'   总文件: {len(files)}（base {type_stats["base"]} + project {type_stats["project"]} 检查, addon {type_stats["addon"]} 豁免, unknown {type_stats["unknown"]} 跳过）')
    print(f'   slug 唯一性: {len(slug_usage)} 个独立 slug（期望 97）')
    print()

    if all_errors:
        print(f'❌ 失败：{len(all_errors)} 个问题')
        # 按文件聚合
        for f in files:
            file_errors = [e for e in all_errors if f.name in e]
            if file_errors:
                print(f'  {f.name}:')
                for e in file_errors:
                    print(e)
        sys.exit(1)
    else:
        print(f'✓ 全部通过（{checked} 节都有 AI 胶囊 + C++ 认脸 + slug/type/title 一致）')
        sys.exit(0)


if __name__ == '__main__':
    main()
