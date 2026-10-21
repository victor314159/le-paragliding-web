import type { Configuration } from 'lint-staged';

export default {
  '*': 'prettier --check --ignore-unknown',
  '*.{ts,js,cjs,mjs,html}': 'eslint --max-warnings=0 --no-warn-ignored',
} satisfies Configuration;
