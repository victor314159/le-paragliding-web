// Release from main: bump versions, commit and push.
//   node scripts/bump.ts web|engine... [patch|minor|major]
// web: the app (root package.json), deployed to GitHub Pages. engine:
// packages/engine, published to npm. CI (.github/workflows/ci.yml) releases a
// version of main once every check passed, then tags it web-v<version> or
// engine-v<version>.
// Runs on the host, for its git credentials; uses no dependencies.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const FILES = {
  web: ['package.json', 'package-lock.json'],
  engine: ['packages/engine/package.json'],
};
type Target = keyof typeof FILES;
const args = process.argv.slice(2);
const targets = [...new Set(args.filter((arg): arg is Target => Object.hasOwn(FILES, arg)))];
const levels = args.filter((arg) => !Object.hasOwn(FILES, arg));
const part = ['major', 'minor', 'patch'].indexOf(levels[0] ?? 'patch');
if (targets.length === 0 || levels.length > 1 || part < 0) {
  console.error('Usage: node scripts/bump.ts web|engine... [patch|minor|major]');
  process.exit(1);
}

const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

if (git('branch', '--show-current') !== 'main') fail('Release from main.');
if (git('status', '--porcelain', '--untracked-files=no') !== '')
  fail('Commit or stash your changes first.');
git('fetch', '--quiet', 'origin', 'main');
if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main'))
  fail('main and origin/main differ: pull or push first.');

const read = (file: string) =>
  JSON.parse(readFileSync(resolve(root, file), 'utf8')) as {
    version: string;
    packages?: Record<string, { version?: string }>;
  };
const bumps = targets.map((target) => {
  const old = read(FILES[target][0]).version;
  const numbers = old.split('.').map(Number);
  if (numbers.length !== 3 || numbers.some(Number.isNaN)) fail(`Cannot bump version ${old}.`);
  numbers[part]++;
  numbers.fill(0, part + 1);
  const version = numbers.join('.');
  for (const file of FILES[target]) {
    const json = read(file);
    json.version = version;
    // package-lock.json repeats the root version in packages[""].
    const lockRoot = json.packages?.[''];
    if (lockRoot) lockRoot.version = version;
    writeFileSync(resolve(root, file), JSON.stringify(json, null, 2) + '\n');
  }
  return { target, old, version };
});

const summary = bumps.map(({ target, version }) => `${target} to ${version}`).join(', ');
git('commit', '--quiet', '-m', `Bump ${summary}`, '--', ...targets.flatMap((t) => FILES[t]));
git('push', 'origin', 'main');
for (const { target, old, version } of bumps) console.log(`${target} ${old} -> ${version}`);
console.log('Pushed main: CI releases and tags once every check passed.');
