import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { stagingRelease } from "./laptop-gateway.mjs";
export function pointerSnapshot(dir) {
  return Object.fromEntries(
    ["active.json", "previous.json"].map((name) => [
      name,
      existsSync(resolve(dir, name)) ? readFileSync(resolve(dir, name)) : null,
    ]),
  );
}
export function restorePointers(dir, snapshot) {
  for (const [name, bytes] of Object.entries(snapshot)) {
    if (!["active.json", "previous.json"].includes(name))
      throw new Error("Invalid pointer name");
    const path = resolve(dir, name);
    if (bytes === null) {
      if (existsSync(path))
        renameSync(
          path,
          resolve(dir, `${randomBytes(8).toString("hex")}-rejected-${name}`),
        );
    } else {
      const temp = resolve(dir, `restore-${name}`);
      writeFileSync(temp, bytes);
      renameSync(temp, path);
    }
  }
}
export async function promoteRelease(dir, value, verify, lifecycle = {}) {
  stagingRelease(value);
  const snapshot = pointerSnapshot(dir),
    path = resolve(dir, "active.json"),
    temp = resolve(dir, "active.next.json");
  let retiring = false;
  try {
    if (snapshot["active.json"])
      writeFileSync(resolve(dir, "previous.json"), snapshot["active.json"]);
    writeFileSync(temp, JSON.stringify(value, null, 2));
    renameSync(temp, path);
    await verify();
    if (snapshot["active.json"] && lifecycle.retirePrevious) {
      retiring = true;
      await lifecycle.retirePrevious(JSON.parse(snapshot["active.json"]));
    }
  } catch (error) {
    if (retiring) {
      try {
        await lifecycle.resumePrevious(JSON.parse(snapshot["active.json"]));
      } catch (recoveryError) {
        // Do not point traffic at a partially stopped previous release or stop
        // the healthy candidate when previous workers cannot be recovered.
        throw new AggregateError([error, recoveryError], "Previous release recovery failed; verified candidate remains active");
      }
    }
    restorePointers(dir, snapshot);
    throw error;
  }
}
