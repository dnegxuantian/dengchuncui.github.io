#!/usr/bin/env python3
"""Run structural checks against a generated Hexo public directory."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

from lxml import html


DELETED_HOSTS = {
    "dmr-blog.oss-cn-shanghai.aliyuncs.com",
    "dmr-blog.oss-accelerate.aliyuncs.com",
    "qingqing-test.oss-cn-qingdao.aliyuncs.com",
}


def local_asset_path(public_root: Path, page: Path, source: str) -> Path | None:
    parsed = urlparse(source)
    if parsed.scheme in {"http", "https", "data"} or source.startswith("//"):
        return None
    clean = unquote(parsed.path)
    if clean.startswith("/"):
        return public_root / clean.lstrip("/")
    return page.parent / clean


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("public_root", nargs="?", default="public")
    parser.add_argument("--include-drafts", action="store_true")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    public_root = Path(args.public_root).resolve()
    if not public_root.exists():
        print(f"Generated directory does not exist: {public_root}", file=sys.stderr)
        return 2

    html_files = list(public_root.rglob("*.html"))
    post_files = []
    missing_assets: list[tuple[Path, str]] = []
    deleted_hosts: list[tuple[Path, str]] = []
    missing_titles: list[Path] = []

    for page in html_files:
        try:
            document = html.parse(str(page))
        except Exception as exc:
            print(f"Unable to parse {page}: {exc}", file=sys.stderr)
            return 2
        relative_parts = page.relative_to(public_root).parts
        is_site_page = bool(relative_parts) and relative_parts[0] not in {"css", "js"}
        if (
            document.xpath(
                '//*[@id="article-container"] | '
                '//article[@id="post" and '
                'contains(concat(" ", normalize-space(@class), " "), '
                '" article-type-post ")]'
            )
            and relative_parts
            and len(relative_parts[0]) == 4
            and relative_parts[0].isdigit()
        ):
            post_files.append(page)
        titles = document.xpath("//title/text()")
        if is_site_page and (not titles or not titles[0].strip()):
            missing_titles.append(page)

        for source in document.xpath("//img/@src | //script/@src | //link[@rel='stylesheet']/@href"):
            host = urlparse(source).netloc
            if host in DELETED_HOSTS:
                deleted_hosts.append((page, source))
            asset = local_asset_path(public_root, page, source)
            if asset is not None and not asset.exists():
                missing_assets.append((page, source))

    checks = {
        "HTML 页面": len(html_files),
        "文章页面": len(post_files),
        "缺少标题": len(missing_titles),
        "缺少本地资源": len(missing_assets),
        "仍引用已删除图床": len(deleted_hosts),
    }
    for label, value in checks.items():
        print(f"{label}: {value}")

    expected_posts = len(list((project_root / "source" / "_posts").glob("*.md")))
    if args.include_drafts:
        expected_posts += len(list((project_root / "source" / "_drafts").glob("*.md")))

    if len(post_files) != expected_posts:
        print(f"Expected {expected_posts} posts, found {len(post_files)}", file=sys.stderr)
    for page, source in missing_assets[:20]:
        print(f"Missing asset: {page.relative_to(public_root)} -> {source}", file=sys.stderr)
    for page, source in deleted_hosts[:20]:
        print(f"Deleted image host: {page.relative_to(public_root)} -> {source}", file=sys.stderr)

    failed = (
        len(post_files) != expected_posts
        or bool(missing_titles)
        or bool(missing_assets)
        or bool(deleted_hosts)
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
