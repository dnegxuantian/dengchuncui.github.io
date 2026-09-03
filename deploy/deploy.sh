#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "用法: $0 <user@server>" >&2
  exit 64
fi

deploy_host="$1"
site_root="/var/www/blog.chuncui.icu"
release_id="$(date -u +%Y%m%dT%H%M%SZ)"
release_dir="${site_root}/releases/${release_id}"

npm run build
npm run check

ssh "$deploy_host" "mkdir -p '$release_dir'"
rsync -az --checksum public/ "${deploy_host}:${release_dir}/"
ssh "$deploy_host" "ln -sfn '$release_dir' '${site_root}/current' && test -f '${site_root}/current/index.html'"

if npm run submit:indexnow; then
  echo "IndexNow 已提交"
else
  echo "警告：站点已发布，但 IndexNow 提交失败，可稍后运行 npm run submit:indexnow 重试" >&2
fi

echo "已发布到 ${deploy_host}:${release_dir}"
echo "当前版本: ${site_root}/current"
