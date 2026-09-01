#!/usr/bin/env python3
"""Recover Hexo post sources from the legacy generated HTML tree.

The original repository only contains the old `public` output. This script
extracts article bodies and metadata, converts them to readable Markdown, keeps
the original permalink, and replaces deleted OSS images with an explicit local
placeholder. Run from the repository root.
"""

from __future__ import annotations

import json
import re
import subprocess
from copy import deepcopy
from pathlib import Path
from urllib.parse import urlparse

import yaml
from lxml import etree, html


ROOT = Path(__file__).resolve().parents[1]
LEGACY_ROOT = ROOT / "legacy-public"
POSTS_ROOT = ROOT / "source" / "_posts"
REPORT_PATH = ROOT / "data" / "legacy-images.json"

DELETED_IMAGE_HOSTS = {
    "dmr-blog.oss-cn-shanghai.aliyuncs.com",
    "dmr-blog.oss-accelerate.aliyuncs.com",
    "qingqing-test.oss-cn-qingdao.aliyuncs.com",
}

RECOVERED_IMAGES = {
    "http://hadoop.apache.org/docs/r1.0.4/cn/images/hdfsarchitecture.gif": (
        "/images/recovered/hdfs-architecture.gif"
    ),
    "https://hadoop.apache.org/docs/r1.0.4/cn/images/hdfsarchitecture.gif": (
        "/images/recovered/hdfs-architecture.gif"
    ),
}


def meta_content(document: etree._ElementTree, prop: str) -> str:
    values = document.xpath(f'//meta[@property="{prop}"]/@content')
    return values[0].strip() if values else ""


def local_datetime(document: etree._ElementTree, css_class: str, fallback: str) -> str:
    titles = document.xpath(
        f'//time[contains(concat(" ", normalize-space(@class), " "), " {css_class} ")]/@title'
    )
    if titles:
        match = re.search(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})", titles[0])
        if match:
            return match.group(1)
    if fallback:
        return fallback.replace("T", " ").replace(".000Z", "").replace("Z", "")
    return ""


def compact_description(node: etree._Element, limit: int = 160) -> str:
    text = re.sub(r"\s+", " ", node.text_content()).strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip("，。；、 ") + "……"


def category_cover(category: str, title: str) -> str:
    if category == "NIO 系列":
        return "/images/covers/nio.svg"
    if category == "大数据":
        return "/images/covers/data.svg"
    if category == "设计模式":
        return "/images/covers/patterns.svg"
    if category == "项目规范":
        return "/images/covers/engineering.svg"
    if "shell" in title.lower() or "安全" in title:
        return "/images/covers/security.svg"
    if category == "java" or "java" in title.lower():
        return "/images/covers/java.svg"
    return "/images/covers/default.svg"


def replace_header_links(article: etree._Element) -> None:
    for anchor in article.xpath(
        './/a[contains(concat(" ", normalize-space(@class), " "), " headerlink ")]'
    ):
        parent = anchor.getparent()
        if parent is not None:
            tail = anchor.tail or ""
            previous = anchor.getprevious()
            if previous is not None:
                previous.tail = (previous.tail or "") + tail
            else:
                parent.text = (parent.text or "") + tail
            parent.remove(anchor)


def split_lists_at_headings(article: etree._Element) -> None:
    """Repair legacy Markdown where missing blank lines nested sections in a list.

    The old renderer accepted headings immediately after the final list item and
    produced invalid list nesting. Browsers displayed it tolerably, but a second
    Markdown conversion would keep the rest of the section inside the bullet.
    Split those lists at each direct heading child before conversion.
    """

    lists = article.xpath(
        './/*[self::ol or self::ul][.//li/*[self::h1 or self::h2 or self::h3 or self::h4 or self::h5 or self::h6]]'
    )
    lists.sort(key=lambda node: len(list(node.iterancestors())), reverse=True)

    for source_list in lists:
        parent = source_list.getparent()
        if parent is None:
            continue
        output_nodes: list[etree._Element] = []
        current_list = etree.Element(source_list.tag, attrib=dict(source_list.attrib))

        def flush_list() -> None:
            nonlocal current_list
            if len(current_list):
                output_nodes.append(current_list)
            current_list = etree.Element(source_list.tag, attrib=dict(source_list.attrib))

        for item in list(source_list):
            heading_positions = [
                position
                for position, child in enumerate(item)
                if child.tag in {"h1", "h2", "h3", "h4", "h5", "h6"}
            ]
            if not heading_positions:
                current_list.append(deepcopy(item))
                continue

            first_heading = heading_positions[0]
            prefix = etree.Element("li", attrib=dict(item.attrib))
            prefix.text = item.text
            for child in list(item)[:first_heading]:
                prefix.append(deepcopy(child))
            if (prefix.text or "").strip() or len(prefix):
                current_list.append(prefix)
            flush_list()

            for child in list(item)[first_heading:]:
                output_nodes.append(deepcopy(child))

        flush_list()
        if not output_nodes:
            continue
        output_nodes[-1].tail = (output_nodes[-1].tail or "") + (source_list.tail or "")
        insertion_index = parent.index(source_list)
        parent.remove(source_list)
        for offset, node in enumerate(output_nodes):
            parent.insert(insertion_index + offset, node)


def replace_highlight_figures(article: etree._Element) -> None:
    figures = list(
        article.xpath(
            './/figure[contains(concat(" ", normalize-space(@class), " "), " highlight ")]'
        )
    )
    for figure in figures:
        classes = [name for name in (figure.get("class") or "").split() if name != "highlight"]
        language = classes[0] if classes else "text"
        code_cells = figure.xpath(
            './/*[contains(concat(" ", normalize-space(@class), " "), " code ")]'
        )
        code_text = ""
        if code_cells:
            lines = code_cells[0].xpath(
                './/*[contains(concat(" ", normalize-space(@class), " "), " line ")]'
            )
            if lines:
                code_text = "\n".join("".join(line.itertext()) for line in lines)
            else:
                code_text = code_cells[0].text_content()
        pre = etree.Element("pre")
        code = etree.SubElement(pre, "code")
        code.set("class", f"language-{language}")
        code.text = code_text.rstrip()
        parent = figure.getparent()
        if parent is not None:
            parent.replace(figure, pre)


def nearest_replaceable_container(image: etree._Element, article: etree._Element) -> etree._Element:
    current = image
    paragraph = None
    while current is not None and current is not article:
        if current.tag == "figure":
            return current
        if current.tag == "p":
            paragraph = current
        current = current.getparent()
    if paragraph is not None and not re.sub(r"\s+", "", paragraph.text_content()):
        return paragraph
    parent = image.getparent()
    if parent is not None and parent.tag == "a" and len(parent) == 1:
        return parent
    return image


def legacy_image_notice(title: str, original_url: str, index: int, alt: str) -> etree._Element:
    figure = etree.Element("figure")
    figure.set("class", "legacy-image-notice")
    figure.set("data-original-src", original_url)
    replacement = etree.SubElement(figure, "img")
    replacement.set("src", "/images/legacy-missing.svg")
    replacement.set("alt", alt or f"{title} 的旧站配图 {index} 未恢复")
    caption = etree.SubElement(figure, "figcaption")
    strong = etree.SubElement(caption, "strong")
    strong.text = f"旧站配图 {index} 未恢复"
    strong.tail = " · 原 OSS 存储桶已经删除，原始地址已记录在迁移清单中。"
    return figure


def replace_images(article: etree._Element, title: str, inventory: list[dict[str, str]]) -> None:
    for index, image in enumerate(list(article.xpath(".//img[@src]")), start=1):
        source = image.get("src", "").strip()
        if not source:
            continue
        if source in RECOVERED_IMAGES:
            image.set("src", RECOVERED_IMAGES[source])
            image.set("loading", "lazy")
            inventory.append(
                {
                    "post": title,
                    "original": source,
                    "replacement": RECOVERED_IMAGES[source],
                    "status": "recovered",
                }
            )
            continue

        host = urlparse(source).netloc
        if host not in DELETED_IMAGE_HOSTS:
            image.set("loading", "lazy")
            continue

        alt = (image.get("alt") or image.get("title") or "").strip()
        target = nearest_replaceable_container(image, article)
        parent = target.getparent()
        if parent is None:
            continue
        replacement = legacy_image_notice(title, source, index, alt)
        parent.replace(target, replacement)
        inventory.append(
            {
                "post": title,
                "original": source,
                "replacement": "/images/legacy-missing.svg",
                "status": "source_bucket_deleted",
            }
        )


def normalize_more_marker(article: etree._Element) -> None:
    for marker in list(article.xpath('.//*[@id="more"]')):
        parent = marker.getparent()
        if parent is None:
            continue
        comment = etree.Comment(" more ")
        parent.replace(marker, comment)


def article_fragment(article: etree._Element) -> str:
    parts = [article.text or ""]
    for child in article:
        parts.append(
            etree.tostring(deepcopy(child), encoding="unicode", method="html")
        )
    return "".join(parts)


def html_to_markdown(fragment: str) -> str:
    completed = subprocess.run(
        ["pandoc", "-f", "html", "-t", "gfm", "--wrap=none"],
        input=fragment,
        text=True,
        capture_output=True,
        check=True,
    )
    markdown = completed.stdout.strip()
    markdown = re.sub(r"\n{4,}", "\n\n\n", markdown)
    return markdown + "\n"


def post_files() -> list[Path]:
    candidates = sorted(LEGACY_ROOT.glob("20[0-9][0-9]/*/*/*/index.html"))
    return [path for path in candidates if path.parts[-5] in {"2020", "2021"}]


def recover() -> None:
    if not LEGACY_ROOT.exists():
        raise SystemExit(f"Legacy directory not found: {LEGACY_ROOT}")

    POSTS_ROOT.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)

    inventory: list[dict[str, str]] = []
    recovered_count = 0

    for index, legacy_path in enumerate(post_files(), start=1):
        document = html.parse(str(legacy_path))
        articles = document.xpath('//*[@id="article-container"]')
        if not articles:
            continue
        article = articles[0]
        title = meta_content(document, "og:title") or "未命名文章"
        published_iso = meta_content(document, "article:published_time")
        modified_iso = meta_content(document, "article:modified_time")
        published = local_datetime(document, "post-meta-date-created", published_iso)
        updated = local_datetime(document, "post-meta-date-updated", modified_iso)
        categories = [
            value.strip()
            for value in document.xpath(
                '//*[@id="post-meta"]//a[contains(concat(" ", normalize-space(@class), " "), " post-meta-categories ")]/text()'
            )
            if value.strip()
        ]
        tags = [
            value.strip()
            for value in document.xpath(
                '//a[contains(concat(" ", normalize-space(@class), " "), " post-meta__tags ")]/text()'
            )
            if value.strip()
        ]
        category = categories[0] if categories else "未分类"
        cover = category_cover(category, title)
        old_permalink = "/" + legacy_path.parent.relative_to(LEGACY_ROOT).as_posix() + "/"

        description = compact_description(article)
        split_lists_at_headings(article)
        replace_header_links(article)
        replace_highlight_figures(article)
        normalize_more_marker(article)
        replace_images(article, title, inventory)
        markdown = html_to_markdown(article_fragment(article))

        front_matter = {
            "title": title,
            "date": published,
            "updated": updated or published,
            "categories": categories or ["未分类"],
            "tags": tags,
            "description": description,
            "cover": cover,
            "top_img": cover,
            "permalink": old_permalink,
            "comments": False,
        }
        filename = f"{published[:10]}-{index:02d}.md"
        output = POSTS_ROOT / filename
        yaml_text = yaml.safe_dump(
            front_matter,
            allow_unicode=True,
            sort_keys=False,
            default_flow_style=False,
        ).strip()
        output.write_text(f"---\n{yaml_text}\n---\n\n{markdown}", encoding="utf-8")
        recovered_count += 1

    REPORT_PATH.write_text(
        json.dumps(
            {
                "summary": {
                    "posts_recovered": recovered_count,
                    "images_total": len(inventory),
                    "images_recovered": sum(item["status"] == "recovered" for item in inventory),
                    "images_missing_from_deleted_bucket": sum(
                        item["status"] == "source_bucket_deleted" for item in inventory
                    ),
                },
                "images": inventory,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Recovered {recovered_count} posts into {POSTS_ROOT}")
    print(f"Wrote image migration report to {REPORT_PATH}")


if __name__ == "__main__":
    recover()
