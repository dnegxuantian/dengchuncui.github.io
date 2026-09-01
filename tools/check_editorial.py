#!/usr/bin/env python3
"""Validate posts written under the expert-v1 editorial standard."""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTENT_DIRS = (ROOT / "source" / "_posts", ROOT / "source" / "_drafts")
STANDARD = "editorial_standard: expert-v1"
DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}")
BANNED = (
    "随着技术发展",
    "在当今",
    "赋能",
    "综上所述",
    "本文将",
    "深入探讨",
    "值得注意的是",
    "未来展望",
    "行业专家认为",
)


def frontmatter_and_body(text: str) -> tuple[str, str]:
    parts = text.split("---", 2)
    if len(parts) != 3:
        return "", text
    return parts[1], parts[2]


def field(frontmatter: str, name: str) -> str | None:
    match = re.search(
        rf"^{re.escape(name)}:\s*[\"']?([^\n\"']+)",
        frontmatter,
        re.MULTILINE,
    )
    return match.group(1).strip() if match else None


def local_images(body: str) -> list[str]:
    return [
        target
        for target in re.findall(r"!\[[^]]*]\(([^)]+)\)", body)
        if target.startswith("/images/articles/")
    ]


def validate(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    frontmatter, body = frontmatter_and_body(text)
    if STANDARD not in frontmatter:
        return []

    errors: list[str] = []
    published = field(frontmatter, "date")
    updated = field(frontmatter, "updated")
    description = field(frontmatter, "description")

    if not published or not DATE_PATTERN.fullmatch(published):
        errors.append("date 缺失或格式不正确")
    if updated != published:
        errors.append("updated 必须与 date 完全一致")
    if not description or len(description) < 35:
        errors.append("description 太短，无法说明文章解决的问题")

    compact_body = re.sub(r"\s+", "", body)
    if len(compact_body) < 2600:
        errors.append(f"正文过短：{len(compact_body)} 字符，最低 2600")
    if len(re.findall(r"^##\s+", body, re.MULTILINE)) < 4:
        errors.append("正文至少需要 4 个二级标题来形成完整论证")
    if "我" not in body:
        errors.append("缺少工程师第一人称判断")
    if len(re.findall(r"https://", body)) < 2:
        errors.append("至少需要 2 个可核对的原始资料链接")
    if not re.search(r"^##\s+.*(?:源码|参考|资料|依据|对照)", body, re.MULTILINE):
        errors.append("缺少源码或参考资料章节")

    images = local_images(body)
    if not images:
        errors.append("缺少 /images/articles/ 下的技术配图")
    for image in images:
        image_path = ROOT / "source" / image.lstrip("/")
        if not image_path.exists():
            errors.append(f"配图不存在：{image}")
            continue
        if image_path.suffix == ".svg":
            puml = ROOT / "diagrams" / f"{image_path.stem}.puml"
            if not puml.exists():
                errors.append(f"PlantUML 源文件不存在：{puml.relative_to(ROOT)}")

    for phrase in BANNED:
        if phrase in body:
            errors.append(f"出现模板化短语：{phrase}")
    if body.count("—") > 2:
        errors.append("破折号使用超过 2 次")

    return errors


def main() -> int:
    checked = 0
    failures: list[str] = []
    for content_dir in CONTENT_DIRS:
        if not content_dir.exists():
            continue
        for path in sorted(content_dir.glob("*.md")):
            text = path.read_text(encoding="utf-8")
            if STANDARD not in text:
                continue
            checked += 1
            for error in validate(path):
                failures.append(f"{path.relative_to(ROOT)}: {error}")

    print(f"expert-v1 文章：{checked}")
    print(f"编辑检查错误：{len(failures)}")
    for failure in failures:
        print(failure, file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
