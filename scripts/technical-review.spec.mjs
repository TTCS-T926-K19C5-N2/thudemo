import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateReview, repository, dimensions } from "./technical-review.mjs";

function fixture() {
  const candidate = {
    pullRequest: 100,
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    diffSha256: "c".repeat(64),
    changedFiles: ["scripts/example.mjs"],
    actor: "operator",
    headCommittedAt: Date.parse("2026-10-17T01:00:00Z"),
  };
  const report = {
    schemaVersion: 1,
    kind: "automated_technical_review",
    policy: "DEC-18",
    repository,
    pullRequest: 100,
    baseSha: candidate.baseSha,
    headSha: candidate.headSha,
    diffSha256: candidate.diffSha256,
    reviewExecution: {
      actor: "operator",
      recordType: "Automated technical review; not independent human approval",
      startedAt: "2026-10-17T01:01:00Z",
      completedAt: "2026-10-17T01:05:00Z",
      runEvidenceUrl: `https://github.com/${repository}/pull/100#issuecomment-123`,
    },
    coverage: {
      changedFiles: [
        {
          path: "scripts/example.mjs",
          assessment:
            "Read all changed lines and callers for behavior preservation.",
          evidence: ["Fixture proof only; never publish this test report."],
        },
      ],
      ...Object.fromEntries(
        dimensions.map((d) => [
          d,
          {
            status: "REVIEWED",
            assessment: `Verified ${d} against affected contracts and actual evidence.`,
            evidence: [
              "Fixture verification evidence for local negative-control tests.",
            ],
          },
        ]),
      ),
    },
    findings: [],
    unverifiedMaterialRisks: [],
    blockingFindingsResolved: true,
    verificationEvidence: [
      "Fixture proof only; never publish this test report.",
    ],
    conclusion: "PASS",
    publishable: true,
  };
  bind(report, candidate);
  return { report, candidate };
}
function bind(report, candidate) {
  candidate.evidenceBody = `DEC18-REPORT-SHA256:${createHash("sha256").update(JSON.stringify(report)).digest("hex")}`;
  candidate.evidenceActor = candidate.actor;
}
const now = Date.parse("2026-10-17T02:00:00Z");
test("valid complete fixture passes validation only, without network/status publication", () => {
  const { report, candidate } = fixture();
  assert.equal(validateReview(report, candidate, now).result, "PASS");
});
for (const [name, mutate, message] of [
  [
    "missing report",
    (x) => {
      x.report = null;
    },
    /Wrong review/,
  ],
  [
    "new head cannot reuse old review",
    (x) => {
      x.candidate.headSha = "d".repeat(40);
    },
    /Stale/,
  ],
  [
    "updated base invalidates old review",
    (x) => {
      x.candidate.baseSha = "d".repeat(40);
    },
    /Stale/,
  ],
  [
    "changed diff",
    (x) => {
      x.candidate.diffSha256 = "d".repeat(64);
    },
    /digest/,
  ],
  [
    "missing file coverage",
    (x) => {
      x.report.coverage.changedFiles = [];
    },
    /coverage/,
  ],
  [
    "duplicate file coverage",
    (x) => {
      x.report.coverage.changedFiles.push(x.report.coverage.changedFiles[0]);
    },
    /coverage/,
  ],
  [
    "missing security analysis",
    (x) => {
      delete x.report.coverage.security;
    },
    /risk review/,
  ],
  [
    "bare CI success is not review",
    (x) => {
      x.report.coverage = {};
    },
    /coverage/,
  ],
  [
    "unverified material risk",
    (x) => {
      x.report.unverifiedMaterialRisks = ["Ownership not checked"];
    },
    /incomplete/,
  ],
  [
    "review before commit",
    (x) => {
      x.report.reviewExecution.completedAt = "2026-10-16T01:00:00Z";
    },
    /timestamps/,
  ],
  [
    "review from future",
    (x) => {
      x.report.reviewExecution.completedAt = "2027-01-01T01:00:00Z";
    },
    /timestamps/,
  ],
  [
    "wrong actor",
    (x) => {
      x.report.reviewExecution.actor = "another-member";
    },
    /actor/,
  ],
  [
    "unpublished report",
    (x) => {
      x.report.publishable = false;
    },
    /incomplete/,
  ],
  [
    "unresolved mandatory finding",
    (x) => {
      x.report.findings = [
        {
          severity: "P2",
          description: "Ownership bypass in the changed route.",
          location: "scripts/example.mjs line 15",
          state: "OPEN",
        },
      ];
    },
    /mandatory/,
  ],
  [
    "unjustified P3 acceptance",
    (x) => {
      x.report.findings = [
        {
          severity: "P3",
          description: "Incorrect behavior violates approved AC.",
          location: "scripts/example.mjs line 15",
          state: "ACCEPTED",
          violatesRequirement: true,
          rationale: "Ignored only to allow the merge to happen.",
        },
      ];
    },
    /mandatory/,
  ],
])
  test(name, () => {
    const value = fixture();
    mutate(value);
    if (value.report) bind(value.report, value.candidate);
    assert.throws(
      () => validateReview(value.report, value.candidate, now),
      message,
    );
  });
test("tampering report after evidence publication is refused", () => {
  const { report, candidate } = fixture();
  report.coverage.security.assessment += " changed";
  assert.throws(() => validateReview(report, candidate, now), /does not bind/);
});
test("comment from another actor is refused", () => {
  const { report, candidate } = fixture();
  candidate.evidenceActor = "someone-else";
  assert.throws(() => validateReview(report, candidate, now), /actor mismatch/);
});
