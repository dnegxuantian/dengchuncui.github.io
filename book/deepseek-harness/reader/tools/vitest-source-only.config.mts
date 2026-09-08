// Diagnostic ESM control: preserve the repository test config, prefer TS over
// stray generated JS beside source. This is not a change to the Harness repo.
import base from '/Users/rui/project/github/deepseek-harness/vitest.config.ts'

const extensions = ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json']
export default {
  ...base,
  root: '/Users/rui/project/github/deepseek-harness',
  resolve: { ...base.resolve, extensions },
  test: {
    ...base.test,
    projects: base.test?.projects?.map(project => typeof project === 'object'
      ? { ...project, resolve: { ...project.resolve, extensions } }
      : project),
  },
}
