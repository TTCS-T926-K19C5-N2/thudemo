import { createHash } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const roots = {
  canonical: 'D:/Merge_2/Codegym',
  prepared: 'D:/Merge_2/Codegym-demo-proof-20261023T1530',
};
const ignored = new Set([
  '.git', 'node_modules', '.next', 'dist', '.sprint1-demo', '.cache',
  'evidence', 'coverage',
]);
function listFiles(root) {
  if (existsSync(resolve(root, '.git'))) {
    return new Set(
      (
        execFileSync('git', ['-c', 'core.quotepath=false', '-C', root, 'ls-files'], { encoding: 'utf8' }) +
        '\n' +
        execFileSync('git', ['-c', 'core.quotepath=false', '-C', root, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' })
      )
        .split(/\r?\n/)
        .filter(Boolean),
    );
  }
  const files = new Set();
  const walk = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignored.has(entry.name)) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(resolve(directory, entry.name), relative);
      else if (!/^\.env(?:\.|$)/.test(entry.name)) files.add(relative);
    }
  };
  walk(root);
  return files;
}
function selectedFiles(root) {
  const files = listFiles(root);
  return [...files]
    .filter(
      (path) =>
        /^(apps\/(api|web)\/|packages\/shared\/|scripts\/(sprint1-onboarding|create-demo-showtime|create-demo-scanner-showtime)|demo-data\/|pnpm-lock\.yaml$|package\.json$)/.test(path) &&
        !path.startsWith('apps/web/.next/') &&
        existsSync(resolve(root, path)),
    )
    .sort();
}
function fingerprint(root) {
  const selected = selectedFiles(root);
  const hash = createHash('sha256');
  for (const path of selected) {
    hash.update(path);
    hash.update(readFileSync(resolve(root, path)));
  }
  return { fingerprint: hash.digest('hex'), selectedFileCount: selected.length };
}
const result = Object.fromEntries(
  Object.entries(roots).map(([name, root]) => [name, fingerprint(root)]),
);
const canonicalFiles = selectedFiles(roots.canonical);
const preparedFiles = selectedFiles(roots.prepared);
const canonicalSet = new Set(canonicalFiles);
const preparedSet = new Set(preparedFiles);
result.onlyCanonical = canonicalFiles.filter((path) => !preparedSet.has(path));
result.onlyPrepared = preparedFiles.filter((path) => !canonicalSet.has(path));
result.contentMismatch = canonicalFiles.filter(
  (path) =>
    preparedSet.has(path) &&
    !readFileSync(resolve(roots.canonical, path)).equals(
      readFileSync(resolve(roots.prepared, path)),
    ),
);
const preparedState = JSON.parse(
  readFileSync(`${roots.prepared}/.sprint1-demo/processes.json`, 'utf8'),
);
result.preparedStateFingerprint = preparedState.fingerprint;
result.preparedStateMatchesPreparedTree =
  preparedState.fingerprint === result.prepared.fingerprint;
result.canonicalMatchesPrepared =
  result.canonical.fingerprint === result.prepared.fingerprint;
result.nonGeneratedSourceContentMatches =
  result.contentMismatch.length === 0 &&
  result.onlyCanonical.length === 0 &&
  result.onlyPrepared.every((path) =>
    ['apps/api/tsconfig.build.tsbuildinfo', 'apps/web/next-env.d.ts'].includes(path),
  );
result.preparedOnlyGeneratedArtifacts = result.onlyPrepared;
result.safety = 'Only selected source file paths and hashes compared; no env/config/private values read into output';
const out = new URL('./r79-source-fingerprint.json', import.meta.url);
await import('node:fs/promises').then(({ writeFile }) =>
  writeFile(out, JSON.stringify(result, null, 2), { mode: 0o600 }),
);
