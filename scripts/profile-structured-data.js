'use strict';

const { stripHTML } = require('hexo-util');

const SITE_URL = 'https://blog.chuncui.icu';
const PROFILE_URL = `${SITE_URL}/about/`;
const PROFILE_ID = `${PROFILE_URL}#person`;
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const GITHUB_URL = 'https://github.com/dnegxuantian';
const HOME_TITLE = '纯粹博客｜邓明瑞';
const HOME_H1 = `
      <h1 class="title home-seo-title">
        <span>邓明瑞 · 纯粹</span>
      </h1>`;

function absoluteSiteUrl(value) {
  if (typeof value !== 'string') return value;
  if (!value.startsWith('/') && !value.startsWith(SITE_URL)) return value;

  try {
    const url = new URL(value, SITE_URL);
    url.pathname = url.pathname.replace(/\/{2,}/g, '/');
    return url.toString();
  } catch (_error) {
    return value;
  }
}

function normalizeUrls(value) {
  if (Array.isArray(value)) return value.map(normalizeUrls);
  if (!value || typeof value !== 'object') return value;

  for (const [key, child] of Object.entries(value)) {
    if ((key === 'url' || key === '@id') && typeof child === 'string') {
      value[key] = absoluteSiteUrl(child);
    } else {
      value[key] = normalizeUrls(child);
    }
  }
  return value;
}

function findPost(path) {
  const postPath = path.replace(/index\.html$/, '');
  return hexo.locals
    .get('posts')
    .toArray()
    .find((post) => post.__permalink === `/${postPath}`);
}

function countArticleWords(content) {
  const text = stripHTML(content || '')
    .replace(/&[a-zA-Z0-9#]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const han = text.match(/[\p{Script=Han}]/gu) || [];
  const words = text.match(/[A-Za-z0-9][A-Za-z0-9_.:/+#-]*/g) || [];
  return han.length + words.length;
}

function firstArticleImage(post) {
  if (!post) return null;
  const content = post.content || '';
  const markdownImage = content.match(/!\[[^\]]*\]\((\/images\/articles\/[^)\s]+)\)/);
  const renderedImage = content.match(/<img[^>]+src=["'](\/images\/articles\/[^"']+)["']/i);
  return (markdownImage && markdownImage[1]) ||
    (renderedImage && renderedImage[1]) ||
    null;
}

function enrichPerson(item) {
  item['@id'] = PROFILE_ID;
  item.name = '邓明瑞';
  item.alternateName = ['纯粹', 'Chuncui'];
  item.url = PROFILE_URL;
  item.sameAs = [GITHUB_URL];
  item.jobTitle = '数据中台与 AI Agent 工程化技术架构师';
  item.worksFor = {
    '@type': 'Organization',
    name: '奇点云',
    alternateName: '奇点智能',
    legalName: '杭州比智科技有限公司'
  };
  item.knowsAbout = [
    'DataX',
    '数据中台',
    '数据湖与湖仓',
    '分布式系统',
    '批流数据处理',
    '元数据与数据治理',
    'AI Agent 工程化',
    'MCP'
  ];
  if (item.image && item.image.url) {
    item.image.url = absoluteSiteUrl(item.image.url);
  }
}

hexo.extend.filter.register('after_post_render', (post) => {
  post.content = (post.content || '').replace(
    /<p>(\s*<img\b(?=[^>]*(?:src|data-srcset)=["']\/images\/articles\/)[^>]*>\s*)<\/p>/gi,
    '<p class="article-diagram-scroll">$1</p>'
  );

  // 原 OSS 桶已经删除。带占位图的旧文继续可访问，但不进入索引和 sitemap；
  // 旧教程也必须显式通过 seo_ready 或 expert-v1 才进入索引。
  const hasMissingLegacyImage = (post.content || '').includes('/images/legacy-missing.svg');
  const editorialReady = post.editorial_standard === 'expert-v1' || post.seo_ready === true;
  if (post.layout === 'post' && (hasMissingLegacyImage || !editorialReady)) {
    post.robots = 'noindex,follow';
    post.sitemap = false;
  }
  return post;
});

hexo.extend.filter.register('after_render:html', (html, data) => {
  const post = findPost(data.path);
  const articleUrl = `${SITE_URL}/${data.path.replace(/index\.html$/, '')}`;
  const cover = firstArticleImage(post) || (post && (post.cover || post.top_img));
  const articleImage = cover ? absoluteSiteUrl(cover) : `${SITE_URL}/images/avatar.jpg`;

  let output = html.replace(
    /<script type="application\/ld\+json">(\[[\s\S]*?\])<\/script>/,
    (script, rawJson) => {
      try {
        let graph = normalizeUrls(JSON.parse(rawJson));
        if (!post) {
          graph = graph.filter((item) => item['@type'] !== 'BlogPosting');
        }
        if (data.path === 'index.html') {
          graph = graph.filter((item) =>
            ['Organization', 'Person', 'WebSite'].includes(item['@type'])
          );
        }

        for (const item of graph) {
          item['@context'] = 'https://schema.org';
          if (item['@type'] === 'Person') {
            enrichPerson(item);
          }
          if (item['@type'] === 'Organization') {
            item['@id'] = ORGANIZATION_ID;
          }
          if (item['@type'] === 'WebSite') {
            item['@id'] = `${SITE_URL}/#website`;
            item.name = HOME_TITLE;
            item.author = { '@type': 'Person', '@id': PROFILE_ID };
            item.publisher = { '@type': 'Organization', '@id': ORGANIZATION_ID };
            delete item.potentialAction;
          }
          if (item['@type'] === 'BlogPosting' && post) {
            item['@id'] = `${articleUrl}#article`;
            item.url = articleUrl;
            item.mainEntityOfPage = { '@type': 'WebPage', '@id': articleUrl };
            item.author = {
              '@type': 'Person',
              '@id': PROFILE_ID,
              name: '邓明瑞',
              url: PROFILE_URL,
              sameAs: [GITHUB_URL]
            };
            item.publisher = { '@type': 'Organization', '@id': ORGANIZATION_ID };
            item.image = { '@type': 'ImageObject', url: articleImage };
            item.wordCount = countArticleWords(post.content);
            item.datePublished = post.date.toISOString();
            item.dateModified = (post.updated || post.date).toISOString();
          }
        }

        return `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
      } catch (error) {
        hexo.log.warn(`无法规范结构化数据：${error.message}`);
        return script;
      }
    }
  );

  if (post && cover) {
    output = output.replace(
      /(<meta property="og:image" content=")[^"]*(">)/,
      `$1${articleImage}$2`
    );
  }
  if (data.path === 'index.html') {
    output = output
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${HOME_TITLE}</title>`)
      .replace(/<p class="title">邓明瑞 · 纯粹<\/p>/, HOME_H1);
  }
  return output;
});
