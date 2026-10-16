import { statfsSync } from "node:fs";
import { resolve } from "node:path";
const GiB = 1024 ** 3;
// Docker Desktop stores its Linux disk on the Windows system volume by default.
// Keep enough room for both images, intermediate layers and rollback slots.
export function requireBuildResources({
  workspacePath,
  systemPath = process.env.SystemRoot ?? "C:\\Windows",
  statfs = statfsSync,
}) {
  const probes = [
    {
      name: "Windows system/Docker Desktop volume",
      path: resolve(systemPath),
      minimumBytes: 12 * GiB,
    },
    {
      name: "Staging source/backup volume",
      path: resolve(workspacePath),
      minimumBytes: 5 * GiB,
    },
  ];
  return probes.map((probe) => {
    const info = statfs(probe.path);
    const freeBytes = info.bavail * info.bsize;
    if (!Number.isFinite(freeBytes) || freeBytes < probe.minimumBytes)
      throw Error(
        `${probe.name} has ${(freeBytes / GiB).toFixed(2)} GiB free; ${(probe.minimumBytes / GiB).toFixed(0)} GiB required before build. Free space without deleting staging data/volumes; active release is not replaced.`,
      );
    return { name: probe.name, freeBytes, minimumBytes: probe.minimumBytes };
  });
}
