import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export const repository = "TTCS-T926-K19C5-N2/thudemo";
export const context = "Review / technical-review";
export const dimensions = [
  "requirements",
  "correctness",
  "security",
  "migration",
  "concurrency",
  "regression",
  "dependency",
  "ci",
  "deployment",
];
const sha = /^[a-f0-9]{40}$/;
const detail = (value) =>
  typeof value === "string" && value.trim().length >= 20;
const requireThat = (condition, message) => {
  if (!condition) throw new Error(message);
};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const run = (command, args) =>
  execFileSync(command, args, { encoding: "utf8", maxBuffer: 30_000_000 });
const api = (path, ...args) => JSON.parse(run("gh", ["api", path, ...args]));

// This validates a completed review record; it never performs semantic review.
export function validateReview(report, candidate, now = Date.now()) {
  requireThat(
    report?.schemaVersion === 1 &&
      report.kind === "automated_technical_review" &&
      report.policy === "DEC-18",
    "Wrong review kind/policy",
  );
  requireThat(
    report.repository === repository &&
      report.pullRequest === candidate.pullRequest,
    "Wrong repository/PR",
  );
  requireThat(
    sha.test(report.baseSha) &&
      sha.test(report.headSha) &&
      report.baseSha === candidate.baseSha &&
      report.headSha === candidate.headSha,
    "Stale or wrong base/head",
  );
  requireThat(
    report.diffSha256 === candidate.diffSha256,
    "Diff digest mismatch",
  );
  const execution = report.reviewExecution;
  requireThat(
    execution?.actor === candidate.actor && detail(execution.recordType),
    "Missing actual actor/execution kind",
  );
  const start = Date.parse(execution.startedAt),
    end = Date.parse(execution.completedAt);
  requireThat(
    Number.isFinite(start) &&
      Number.isFinite(end) &&
      start <= end &&
      end <= now &&
      end >= candidate.headCommittedAt,
    "Invalid review execution timestamps",
  );
  const expectedUrl = `https://github.com/${repository}/pull/${candidate.pullRequest}#issuecomment-`;
  requireThat(
    typeof execution.runEvidenceUrl === "string" &&
      execution.runEvidenceUrl.startsWith(expectedUrl) &&
      /^\d+$/.test(execution.runEvidenceUrl.slice(expectedUrl.length)),
    "Review evidence must be a PR comment",
  );
  requireThat(
    candidate.evidenceBody?.includes(
      `DEC18-REPORT-SHA256:${digest(JSON.stringify(report))}`,
    ),
    "Published evidence does not bind this report",
  );
  requireThat(
    candidate.evidenceActor === execution.actor,
    "Evidence actor mismatch",
  );
  const files = report.coverage?.changedFiles;
  requireThat(
    Array.isArray(files) &&
      files.length === candidate.changedFiles.length &&
      new Set(files.map((f) => f.path)).size === files.length,
    "Incomplete or duplicate file coverage",
  );
  for (const file of files)
    requireThat(
      candidate.changedFiles.includes(file.path) &&
        detail(file.assessment) &&
        Array.isArray(file.evidence) &&
        file.evidence.length > 0 &&
        file.evidence.every(detail),
      `Missing file review: ${file.path}`,
    );
  for (const dimension of dimensions) {
    const coverage = report.coverage?.[dimension];
    requireThat(
      coverage &&
        ["REVIEWED", "NOT_APPLICABLE"].includes(coverage.status) &&
        detail(coverage.assessment) &&
        Array.isArray(coverage.evidence) &&
        coverage.evidence.length > 0 &&
        coverage.evidence.every(detail),
      `Missing risk review: ${dimension}`,
    );
  }
  requireThat(Array.isArray(report.findings), "Missing findings array");
  for (const finding of report.findings) {
    requireThat(
      ["P0", "P1", "P2", "P3"].includes(finding.severity) &&
        detail(finding.description) &&
        detail(finding.location),
      "Malformed finding",
    );
    requireThat(
      finding.state === "RESOLVED"
        ? detail(finding.fixEvidence) && detail(finding.regressionEvidence)
        : finding.severity === "P3" &&
            finding.state === "ACCEPTED" &&
            finding.violatesRequirement === false &&
            detail(finding.rationale),
      "Unresolved mandatory finding",
    );
  }
  requireThat(
    report.unverifiedMaterialRisks?.length === 0 &&
      report.blockingFindingsResolved === true &&
      report.conclusion === "PASS" &&
      report.publishable === true,
    "Review incomplete or not publishable",
  );
  requireThat(
    Array.isArray(report.verificationEvidence) &&
      report.verificationEvidence.length > 0 &&
      report.verificationEvidence.every(detail),
    "Missing verification evidence",
  );
  return {
    result: "PASS",
    headSha: report.headSha,
    baseSha: report.baseSha,
    diffSha256: report.diffSha256,
  };
}

export function inspectCandidate(pullRequest) {
  requireThat(
    Number.isSafeInteger(pullRequest) && pullRequest > 0,
    "Invalid PR number",
  );
  const pr = api(`repos/${repository}/pulls/${pullRequest}`);
  requireThat(
    pr.state === "open" &&
      !pr.draft &&
      pr.base.ref === "develop" &&
      pr.base.repo.full_name === repository &&
      pr.head.repo.full_name === repository,
    "Only open non-draft same-repository develop PRs",
  );
  const baseSha = pr.base.sha,
    headSha = pr.head.sha;
  requireThat(sha.test(baseSha) && sha.test(headSha), "Invalid GitHub SHA");
  const origin = run("git", ["remote", "get-url", "origin"]).trim();
  requireThat(
    origin === `https://github.com/${repository}.git` ||
      origin === `https://github.com/${repository}` ||
      origin === `git@github.com:${repository}.git`,
    "Wrong local repository",
  );
  requireThat(
    run("git", ["merge-base", baseSha, headSha]).trim() === baseSha,
    "PR branch must contain current develop",
  );
  const patch = execFileSync(
    "git",
    [
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--binary",
      "--no-renames",
      `${baseSha}...${headSha}`,
    ],
    { maxBuffer: 30_000_000 },
  );
  const changedFiles = run("git", [
    "diff",
    "--no-ext-diff",
    "--no-renames",
    "--name-only",
    "-z",
    `${baseSha}...${headSha}`,
  ])
    .split("\0")
    .filter(Boolean);
  requireThat(changedFiles.length > 0, "Empty diff");
  return {
    pullRequest,
    baseSha,
    headSha,
    diffSha256: digest(patch),
    changedFiles,
    actor: api("user").login,
    headCommittedAt:
      Number(run("git", ["show", "-s", "--format=%ct", headSha]).trim()) * 1000,
  };
}

function main() {
  const [mode, prNumber, file] = process.argv.slice(2);
  requireThat(
    ["inspect", "validate", "publish"].includes(mode),
    "Usage: node scripts/technical-review.mjs inspect|validate|publish PR [report.json]",
  );
  const candidate = inspectCandidate(Number(prNumber));
  if (mode === "inspect") {
    console.log(JSON.stringify(candidate, null, 2));
    return;
  }
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  const url = report.reviewExecution?.runEvidenceUrl ?? "";
  const match = url.match(
    new RegExp(
      `^https://github\\.com/${repository}/pull/${candidate.pullRequest}#issuecomment-(\\d+)$`,
    ),
  );
  requireThat(match, "Invalid evidence comment URL");
  const comment = api(`repos/${repository}/issues/comments/${match[1]}`);
  candidate.evidenceBody = comment.body;
  candidate.evidenceActor = comment.user.login;
  const result = validateReview(report, candidate);
  if (mode === "publish") {
    // Re-read immediately before mutation; a push or base update invalidates the report.
    const current = inspectCandidate(candidate.pullRequest);
    requireThat(
      current.baseSha === candidate.baseSha &&
        current.headSha === candidate.headSha &&
        current.diffSha256 === candidate.diffSha256,
      "Candidate changed before publication",
    );
    const published = api(
      `repos/${repository}/statuses/${candidate.headSha}`,
      "--method",
      "POST",
      "-f",
      "state=success",
      "-f",
      `context=${context}`,
      "-f",
      "description=DEC-18 exact-SHA technical review completed",
      "-f",
      `target_url=${url}`,
    );
    const statuses = api(
      `repos/${repository}/commits/${candidate.headSha}/statuses`,
    );
    requireThat(
      statuses.some(
        (status) =>
          status.id === published.id &&
          status.state === "success" &&
          status.context === context &&
          status.creator.login === candidate.actor &&
          status.target_url === url,
      ),
      "Status publication readback mismatch",
    );
    result.statusId = published.id;
  }
  console.log(JSON.stringify(result, null, 2));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(`Technical review refused: ${error.message}`);
    process.exitCode = 1;
  }
}
