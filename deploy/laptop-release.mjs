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
export async function promoteRelease(dir, value, verify) {
  stagingRelease(value);
  const snapshot = pointerSnapshot(dir),
    path = resolve(dir, "active.json"),
    temp = resolve(dir, "active.next.json");
  try {
    if (snapshot["active.json"])
      writeFileSync(resolve(dir, "previous.json"), snapshot["active.json"]);
    writeFileSync(temp, JSON.stringify(value, null, 2));
    renameSync(temp, path);
    await verify();
  } catch (error) {
    restorePointers(dir, snapshot);
    throw error;
  }
}
