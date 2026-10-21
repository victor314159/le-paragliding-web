// Release from main: bump a version, commit, tag and push.
//   node scripts/bump.ts web|engine [patch|minor|major]
// web: the app (root package.json), tag web-v<version>; pushing main deploys
// GitHub Pages. engine: packages/engine, tag engine-v<version>; the tag
// publishes the npm package (release job in .github/workflows/ci.yml).
// Runs on the host, for its git credentials; uses no dependencies.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [target, level = 'patch'] = process.argv.slice(2);
const files = {
  web: ['package.json', 'package-lock.json'],
  engine: ['packages/engine/package.json'],
}[target ?? ''];
const part = ['major', 'minor', 'patch'].indexOf(level);
if (files === undefined || part < 0) {
  console.error('Usage: node scripts/bump.ts web|engine [patch|minor|major]');
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
const old = read(files[0]).version;
const numbers = old.split('.').map(Number);
if (numbers.length !== 3 || numbers.some(Number.isNaN)) fail(`Cannot bump version ${old}.`);
numbers[part]++;
numbers.fill(0, part + 1);
const version = numbers.join('.');
const tag = `${target}-v${version}`;
if (git('tag', '--list', tag) !== '') fail(`Tag ${tag} already exists.`);

for (const file of files) {
  const json = read(file);
  json.version = version;
  // package-lock.json repeats the root version in packages[""].
  const lockRoot = json.packages?.[''];
  if (lockRoot) lockRoot.version = version;
  writeFileSync(resolve(root, file), JSON.stringify(json, null, 2) + '\n');
}

git('commit', '--quiet', '-m', `Bump ${target} to ${version}`, '--', ...files);
git('tag', '-a', tag, '-m', `${target} ${version}`);
git('push', '--atomic', 'origin', 'main', tag);
console.log(`${target} ${old} -> ${version}, pushed main and ${tag}.`);
