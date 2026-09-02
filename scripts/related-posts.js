'use strict';

function collectionNames(collection) {
  if (!collection) return [];
  const items = typeof collection.toArray === 'function'
    ? collection.toArray()
    : Array.isArray(collection) ? collection : [];
  return items.map(item => item && item.name).filter(Boolean);
}

function sharedCount(left, right) {
  const rightSet = new Set(right);
  return left.reduce((count, item) => count + (rightSet.has(item) ? 1 : 0), 0);
}

hexo.extend.helper.register('popular_posts_json', function relatedPostsJson(options, currentPost) {
  const settings = options || {};
  const maxCount = Number(settings.maxCount) > 0 ? Number(settings.maxCount) : 4;
  const currentTags = collectionNames(currentPost && currentPost.tags);
  const currentCategories = collectionNames(currentPost && currentPost.categories);
  const currentPath = currentPost && currentPost.path;
  const posts = this.site && this.site.posts && typeof this.site.posts.toArray === 'function'
    ? this.site.posts.toArray()
    : [];

  const ranked = posts
    .filter(post => post.path !== currentPath && post.published !== false)
    .map(post => {
      const sameTags = sharedCount(currentTags, collectionNames(post.tags));
      const sameCategories = sharedCount(currentCategories, collectionNames(post.categories));
      return {
        post,
        score: sameTags * 4 + sameCategories * 2,
        time: post.date ? new Date(post.date).getTime() : 0
      };
    })
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || right.time - left.time)
    .slice(0, maxCount)
    .map(item => ({
      title: item.post.title,
      path: this.url_for(item.post.path),
      img: item.post.cover || item.post.top_img || '',
      excerpt: item.post.description || item.post.excerpt || ''
    }));

  return {
    class: settings.ulClass || 'vlts-rps',
    json: ranked
  };
});
