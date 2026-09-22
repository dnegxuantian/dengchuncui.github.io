// Pure selection logic; no command is executed here.
export function commandCatalog(manifest, filter, maxCommands) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('package.json must contain an object');
  }
  const scripts = manifest.scripts ?? {};
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) {
    throw new Error('package.json scripts must be an object');
  }
  const entries = Object.entries(scripts);
  if (entries.some(([, command]) => typeof command !== 'string')) {
    throw new Error('Every script command must be a string');
  }
  const matches = entries.filter(([name]) => name.toLowerCase().includes(filter.toLowerCase()))
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return {
    project: typeof manifest.name === 'string' ? manifest.name : '(unnamed)',
    scripts: matches.slice(0, maxCommands).map(([name, command]) => ({name, command})),
    total: matches.length,
    limited: matches.length > maxCommands,
  };
}
