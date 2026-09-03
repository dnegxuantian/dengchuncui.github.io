#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const CANONICAL_SITE_URL = 'https://blog.chuncui.icu';
const LEGACY_SITE_URL = 'https://chuncui.icu';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const INDEXNOW_KEY = '2266896db94fbb2fc355b8f7a82c27d3';
const sitemapPath = process.argv[2] || 'public/sitemap.xml';

function decodeXml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function urlsFromSitemap(xml) {
  const expectedHost = new URL(CANONICAL_SITE_URL).host;
  const urls = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)]
    .map((match) => decodeXml(match[1].trim()))
    .filter((value) => {
      try {
        return new URL(value).host === expectedHost;
      } catch {
        return false;
      }
    });

  return [...new Set(urls)];
}

function remapHost(urlList, siteUrl) {
  const target = new URL(siteUrl);
  return urlList.map((value) => {
    const source = new URL(value);
    source.protocol = target.protocol;
    source.host = target.host;
    return source.toString();
  });
}

async function submit(siteUrl, urlList) {
  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(siteUrl).host,
      key: INDEXNOW_KEY,
      keyLocation: `${siteUrl}/${INDEXNOW_KEY}.txt`,
      urlList
    })
  });

  if (![200, 202].includes(response.status)) {
    const detail = (await response.text()).trim();
    throw new Error(`IndexNow 返回 ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  return response.status;
}

const sitemap = await readFile(sitemapPath, 'utf8');
const urls = urlsFromSitemap(sitemap);

if (urls.length === 0) {
  throw new Error(`没有从 ${sitemapPath} 读取到本站 URL`);
}

for (const siteUrl of [CANONICAL_SITE_URL, LEGACY_SITE_URL]) {
  const siteUrls = remapHost(urls, siteUrl);
  for (let offset = 0; offset < siteUrls.length; offset += 10000) {
    const batch = siteUrls.slice(offset, offset + 10000);
    const status = await submit(siteUrl, batch);
    console.log(`${new URL(siteUrl).host}：IndexNow 接受 ${batch.length} 个 URL，HTTP ${status}`);
  }
}
