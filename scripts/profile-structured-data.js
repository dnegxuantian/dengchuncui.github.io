'use strict';

const SITE_URL = 'https://blog.chuncui.icu';
const PROFILE_URL = `${SITE_URL}/about/`;
const PROFILE_ID = `${PROFILE_URL}#person`;
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const GITHUB_URL = 'https://github.com/dnegxuantian';

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

hexo.extend.filter.register('after_render:html', (html, data) => {
  const post = findPost(data.path);
  const articleUrl = `${SITE_URL}/${data.path.replace(/index\.html$/, '')}`;
  const cover = post && (post.cover || post.top_img);
  const articleImage = cover ? absoluteSiteUrl(cover) : `${SITE_URL}/images/avatar.jpg`;

  let output = html.replace(
    /<script type="application\/ld\+json">(\[[\s\S]*?\])<\/script>/,
    (script, rawJson) => {
      try {
        let graph = normalizeUrls(JSON.parse(rawJson));
        if (data.path === 'about/index.html') {
          graph = graph.filter((item) => item['@type'] !== 'BlogPosting');
        }

        for (const item of graph) {
          item['@context'] = 'https://schema.org';
          if (item['@type'] === 'Person') {
            item['@id'] = PROFILE_ID;
            item.url = PROFILE_URL;
            item.sameAs = [GITHUB_URL];
            if (item.image && item.image.url) {
              item.image.url = absoluteSiteUrl(item.image.url);
            }
          }
          if (item['@type'] === 'Organization') {
            item['@id'] = ORGANIZATION_ID;
          }
          if (item['@type'] === 'WebSite') {
            item['@id'] = `${SITE_URL}/#website`;
            item.author = { '@type': 'Person', '@id': PROFILE_ID };
            item.publisher = { '@type': 'Organization', '@id': ORGANIZATION_ID };
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
            delete item.wordCount;
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
  return output;
});
