#!/usr/bin/env python3
"""Validate the source timeline and generated historical engineering notes."""

from __future__ import annotations

import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
POST_DIR = ROOT / "source" / "_posts"
PUBLIC_IMAGE_DIR = ROOT / "source"
MARKER = "<!-- generated: timeline-backfill -->"
EXPECTED_TOTAL = 120
EXPECTED_GENERATED = 90
BANNED = ("随着技术", "随着时代", "在当今", "赋能", "综上所述", "本文将", "深入探讨", "值得注意的是")


def months_between(start: tuple[int, int], end: tuple[int, int]) -> list[str]:
    year, month = start
    result = []
    while (year, month) <= end:
        result.append(f"{year:04d}-{month:02d}")
        month += 1
        if month == 13:
            year += 1
            month = 1
    return result


def field(text: str, name: str) -> str | None:
    match = re.search(rf"^{re.escape(name)}:\s*[\"']?([^\n\"']+)", text, re.MULTILINE)
    return match.group(1).strip() if match else None


def content_bigrams(text: str) -> set[str]:
    body = text.split("---", 2)[-1]
    body = re.sub(r"https?://\S+", "", body)
    body = re.sub(r"[^\u4e00-\u9fffA-Za-z0-9]+", "", body)
    return {body[index : index + 2] for index in range(max(0, len(body) - 1))}


def main() -> int:
    errors: list[str] = []
    month_counts: Counter[str] = Counter()
    generated_month_counts: Counter[str] = Counter()
    generated_posts: list[tuple[Path, str]] = []
    all_posts = sorted(POST_DIR.glob("*.md"))

    for path in all_posts:
        text = path.read_text(encoding="utf-8")
        published = field(text, "date")
        updated = field(text, "updated")
        if not published:
            errors.append(f"缺少 date: {path.name}")
            continue
        month_counts[published[:7]] += 1
        if MARKER not in text:
            continue
        generated_posts.append((path, text))
        generated_month_counts[published[:7]] += 1
        if published != updated:
            errors.append(f"date 与 updated 不一致: {path.name}")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", published):
            errors.append(f"时间格式错误: {path.name} -> {published}")
        if published[:10] > date(2026, 8, 31).isoformat():
            errors.append(f"补更日期超出 2026-08: {path.name}")
        for phrase in BANNED:
            if phrase in text:
                errors.append(f"出现模板化短语 {phrase}: {path.name}")
        for image in re.findall(r"!\[[^]]*]\(([^)]+)\)", text):
            if image.startswith(("http://", "https://", "//")):
                errors.append(f"使用外链配图: {path.name} -> {image}")
            elif image.startswith("/") and not (PUBLIC_IMAGE_DIR / image.lstrip("/")).exists():
                errors.append(f"本地配图不存在: {path.name} -> {image}")

    for month in months_between((2020, 3), (2026, 8)):
        if month_counts[month] == 0:
            errors.append(f"月份断档: {month}")
    for month, count in generated_month_counts.items():
        if count not in {1, 2}:
            errors.append(f"补更频率不是 1-2 篇: {month} -> {count}")
    if len(all_posts) != EXPECTED_TOTAL:
        errors.append(f"文章总数应为 {EXPECTED_TOTAL}，实际 {len(all_posts)}")
    if len(generated_posts) != EXPECTED_GENERATED:
        errors.append(f"补更文章应为 {EXPECTED_GENERATED}，实际 {len(generated_posts)}")
    if len(generated_month_counts) != 68:
        errors.append(f"补更月份应为 68，实际 {len(generated_month_counts)}")

    closest: tuple[float, str, str] = (0.0, "", "")
    grams = [(path.name, content_bigrams(text)) for path, text in generated_posts]
    for index, (left_name, left) in enumerate(grams):
        for right_name, right in grams[index + 1 :]:
            union = left | right
            score = len(left & right) / len(union) if union else 0.0
            if score > closest[0]:
                closest = (score, left_name, right_name)
    if closest[0] >= 0.42:
        errors.append(f"文章内容过于相似: {closest[1]} / {closest[2]} -> {closest[0]:.3f}")

    print(f"文章总数: {len(all_posts)}")
    print(f"补更文章: {len(generated_posts)}")
    print(f"连续月份: {len(months_between((2020, 3), (2026, 8)))}")
    print(f"双更月份: {sum(1 for count in generated_month_counts.values() if count == 2)}")
    print(f"最高内容相似度: {closest[0]:.3f}")
    print(f"时间或资源错误: {len(errors)}")
    for error in errors[:30]:
        print(error, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
