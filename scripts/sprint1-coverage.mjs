// Compare isolated origin/develop baseline and candidate using the SAME checked-in
// Vitest 4.1.11/V8 configuration; never infer coverage from a test count.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dirname, "..");
const baseline = resolve(
  root,
  process.env.SPRINT1_COVERAGE_BASELINE_DIR ?? ".sprint1-local/baseline",
);
const baseSha =
  process.env.SPRINT1_COVERAGE_BASE_SHA ??
  "07d683fcfcfd7d05c8aff1119ab6dc3c63f6e458";
const output = resolve(
  root,
  process.env.SPRINT1_COVERAGE_OUTPUT ??
    "evidence/sprint1/20261015-gitflow/coverage",
);
mkdirSync(output, { recursive: true });
const slash = (path) => path.replaceAll("\\", "/");
const normalize = (data, dir) =>
  Object.fromEntries(
    Object.entries(data).map(([path, value]) => [
      path === "total" ? path : slash(relative(dir, path)),
      value,
    ]),
  );
function changedLines(path) {
  const result = spawnSync("git", ["show", `${baseSha}:${path}`], {
    cwd: root,
    encoding: "utf8",
  });
  const oldFile = resolve(root, ".sprint1-local/coverage-before.txt");
  const nextFile = resolve(root, ".sprint1-local/coverage-after.txt");
  writeFileSync(oldFile, result.status === 0 ? result.stdout : "");
  writeFileSync(nextFile, readFileSync(resolve(root, path)));
  const diff = spawnSync(
    "git",
    ["diff", "--no-index", "--no-ext-diff", "--unified=0", oldFile, nextFile],
    { encoding: "utf8" },
  );
  if (![0, 1].includes(diff.status))
    throw new Error("Cannot compute coverage diff");
  const old = new Set(),
    next = new Set();
  for (const match of diff.stdout.matchAll(
    /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm,
  )) {
    for (let i = 0; i < Number(match[2] ?? 1); i++)
      old.add(Number(match[1]) + i);
    for (let i = 0; i < Number(match[4] ?? 1); i++)
      next.add(Number(match[3]) + i);
  }
  return { old, next, added: result.status !== 0 };
}
function counters(file, lines) {
  if (!file)
    return {
      executableLines: 0,
      coveredLines: 0,
      branches: 0,
      coveredBranches: 0,
      linePct: null,
      branchPct: null,
    };
  const lineCounts = new Map();
  for (const [id, loc] of Object.entries(file.statementMap)) {
    if (lines.has(loc.start.line))
      lineCounts.set(
        loc.start.line,
        Math.max(lineCounts.get(loc.start.line) ?? 0, file.s[id]),
      );
  }
  let branches = 0,
    coveredBranches = 0;
  for (const [id, branch] of Object.entries(file.branchMap)) {
    const touches = [branch.loc, ...branch.locations].some(
      (loc) =>
        loc &&
        [...lines].some(
          (line) => line >= loc.start.line && line <= loc.end.line,
        ),
    );
    if (touches) {
      branches += file.b[id].length;
      coveredBranches += file.b[id].filter((hits) => hits > 0).length;
    }
  }
  const executableLines = lineCounts.size,
    coveredLines = [...lineCounts.values()].filter((hits) => hits > 0).length;
  return {
    executableLines,
    coveredLines,
    branches,
    coveredBranches,
    linePct: executableLines ? (100 * coveredLines) / executableLines : null,
    branchPct: branches ? (100 * coveredBranches) / branches : null,
  };
}
const projects = [];
for (const name of (process.env.SPRINT1_COVERAGE_PROJECTS ?? "api,web").split(
  ",",
)) {
  const config = `apps/${name}/${process.env.SPRINT1_COVERAGE_CONFIG ?? "vitest.sprint1-coverage.config.ts"}`;
  const bytes = readFileSync(resolve(root, config));
  if (!bytes.equals(readFileSync(resolve(baseline, config))))
    throw new Error("Coverage configs differ");
  const load = (dir, file) =>
    JSON.parse(
      readFileSync(
        resolve(
          dir,
          `apps/${name}/coverage/${process.env.SPRINT1_COVERAGE_REPORT ?? "sprint1"}/${file}`,
        ),
      ),
    );
  const beforeSummary = normalize(
    load(baseline, "coverage-summary.json"),
    baseline,
  );
  const afterSummary = normalize(load(root, "coverage-summary.json"), root);
  const before = normalize(load(baseline, "coverage-final.json"), baseline);
  const after = normalize(load(root, "coverage-final.json"), root);
  // Canonical relative-path summaries are shareable; raw coverage lives locally.
  writeFileSync(
    resolve(output, `${name}-baseline-summary.json`),
    JSON.stringify(beforeSummary, null, 2),
  );
  writeFileSync(
    resolve(output, `${name}-candidate-summary.json`),
    JSON.stringify(afterSummary, null, 2),
  );
  const files = [];
  for (const [path, file] of Object.entries(after)) {
    if (!existsSync(resolve(root, path)))
      throw new Error(`Coverage source absent: ${path}`);
    const changed = changedLines(path);
    files.push({
      path,
      newFile: changed.added,
      baselineChanged: counters(before[path], changed.old),
      candidateChanged: counters(file, changed.next),
      sourceSha256: createHash("sha256")
        .update(readFileSync(resolve(root, path)))
        .digest("hex"),
    });
  }
  projects.push({
    name,
    configSha256: createHash("sha256").update(bytes).digest("hex"),
    before: beforeSummary.total,
    after: afterSummary.total,
    files,
  });
}
writeFileSync(
  resolve(output, "comparison.json"),
  JSON.stringify(
    {
      baseSha,
      source: "candidate source hashes per file; rerun after runtime edits",
      node: process.version,
      vitest: "4.1.11",
      provider: "@vitest/coverage-v8@4.1.11",
      method:
        "Original tests on each revision; identical coverage scope/config. Changed-line counters use V8 Istanbul executable statement start lines and branches intersecting diff hunks. New files have no baseline denominator. Unit coverage does not imply endpoint/staging acceptance.",
      projects,
    },
    null,
    2,
  ),
);
console.log(
  "Coverage comparison written; inspect per-file changed-line and branch denominators.",
);
