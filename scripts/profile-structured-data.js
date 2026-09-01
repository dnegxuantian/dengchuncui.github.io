'use strict';

hexo.extend.filter.register('after_render:html', (html, data) => {
  if (data.path !== 'about/index.html') return html;

  return html.replace(
    /<script type="application\/ld\+json">(\[[\s\S]*?\])<\/script>/,
    (script, rawJson) => {
      try {
        const graph = JSON.parse(rawJson);
        const profileGraph = graph.filter((item) => item['@type'] !== 'BlogPosting');
        return `<script type="application/ld+json">${JSON.stringify(profileGraph)}</script>`;
      } catch (error) {
        hexo.log.warn(`无法清理关于页结构化数据：${error.message}`);
        return script;
      }
    }
  );
});
