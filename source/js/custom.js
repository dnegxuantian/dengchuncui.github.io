(() => {
  const markExternalLinks = () => {
    document.querySelectorAll('#article-container a[href^="http"]').forEach((link) => {
      link.rel = 'noopener noreferrer';
      link.target = '_blank';
    });
  };

  document.addEventListener('DOMContentLoaded', markExternalLinks, { once: true });
  document.addEventListener('pjax:complete', markExternalLinks);
})();
