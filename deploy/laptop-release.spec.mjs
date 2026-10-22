import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  rmdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promoteRelease } from "./laptop-release.mjs";
const candidate = { sha: "b".repeat(40), webPort: 3474, apiPort: 3472 };
async function fixture(run) {
  const dir = mkdtempSync(resolve(tmpdir(), "sprint1-promotion-test-"));
  try {
    await run(dir);
  } finally {
    for (const file of readdirSync(dir)) unlinkSync(resolve(dir, file));
    rmdirSync(dir);
  }
}
test("post-switch smoke failure restores BOTH old active and previous byte-for-byte before cleanup", async () =>
  fixture(async (dir) => {
    const active = Buffer.from(
        '{ "sha":"' + "a".repeat(40) + '", "webPort":3473,"apiPort":3471 }\n',
      ),
      previous = Buffer.from("prior-pointer-retained-exactly");
    writeFileSync(resolve(dir, "active.json"), active);
    writeFileSync(resolve(dir, "previous.json"), previous);
    await assert.rejects(
      promoteRelease(dir, candidate, async () => {
        assert.equal(
          JSON.parse(readFileSync(resolve(dir, "active.json"))).sha,
          candidate.sha,
        );
        throw new Error("TLS candidate smoke failed");
      }),
      /TLS candidate/,
    );
    assert.deepEqual(readFileSync(resolve(dir, "active.json")), active);
    assert.deepEqual(readFileSync(resolve(dir, "previous.json")), previous);
  }));
test("successful verification promotes candidate and retains prior active for rollback", async () =>
  fixture(async (dir) => {
    const active = Buffer.from(
      JSON.stringify({ sha: "a".repeat(40), webPort: 3473, apiPort: 3471 }),
    );
    writeFileSync(resolve(dir, "active.json"), active);
    await promoteRelease(dir, candidate, async () => {});
    assert.equal(
      JSON.parse(readFileSync(resolve(dir, "active.json"))).sha,
      candidate.sha,
    );
    assert.deepEqual(readFileSync(resolve(dir, "previous.json")), active);
  }));

test("retire previous workers only after new gateway verification; preserve rollback manifest", async () =>
  fixture(async dir => {
    const old={sha:"a".repeat(40),webPort:3473,apiPort:3471};
    writeFileSync(resolve(dir,"active.json"),JSON.stringify(old));
    const events=[];
    await promoteRelease(dir,candidate,async()=>{events.push("verify");}, {
      retirePrevious(previous){assert.deepEqual(previous,old);events.push("retire");},
      resumePrevious(){throw Error("No recovery expected");},
    });
    assert.deepEqual(events,["verify","retire"]);
    assert.deepEqual(JSON.parse(readFileSync(resolve(dir,"previous.json"))),old);
  }));

test("failed new gateway verification never stops previous workers", async () =>
  fixture(async dir => {
    const old=JSON.stringify({sha:"a".repeat(40),webPort:3473,apiPort:3471});
    writeFileSync(resolve(dir,"active.json"),old);let retired=false;
    await assert.rejects(promoteRelease(dir,candidate,async()=>{throw Error("unhealthy");},{retirePrevious(){retired=true;}}),/unhealthy/);
    assert.equal(retired,false);assert.equal(readFileSync(resolve(dir,"active.json"),"utf8"),old);
  }));

test("partial previous-worker stop failure resumes previous before restoring traffic", async () =>
  fixture(async dir => {
    const old=JSON.stringify({sha:"a".repeat(40),webPort:3473,apiPort:3471});
    writeFileSync(resolve(dir,"active.json"),old);const events=[];
    await assert.rejects(promoteRelease(dir,candidate,async()=>events.push("verify"),{
      retirePrevious(){events.push("stop-first-worker");throw Error("second stop failed");},
      resumePrevious(){assert.equal(JSON.parse(readFileSync(resolve(dir,"active.json"))).sha,candidate.sha);events.push("resume-and-check-old");},
    }),/second stop/);
    assert.deepEqual(events,["verify","stop-first-worker","resume-and-check-old"]);
    assert.equal(readFileSync(resolve(dir,"active.json"),"utf8"),old);
  }));

test("unrecoverable previous restart failure keeps verified candidate active for operator recovery", async () =>
  fixture(async dir => {
    writeFileSync(resolve(dir,"active.json"),JSON.stringify({sha:"a".repeat(40),webPort:3473,apiPort:3471}));
    await assert.rejects(promoteRelease(dir,candidate,async()=>{}, {
      retirePrevious(){throw Error("stop failed");},resumePrevious(){throw Error("restart failed");},
    }),/verified candidate remains active/);
    assert.equal(JSON.parse(readFileSync(resolve(dir,"active.json"))).sha,candidate.sha);
  }));
