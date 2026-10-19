import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const config = createRequire(web.resolve("eslint-config-next"));
const pluginEntry = config.resolve("@next/eslint-plugin-next");
const { getRootDirs } = config(
  resolve(dirname(pluginEntry), "utils/get-root-dirs.js"),
);
const roots = (pattern) =>
  getRootDirs({ cwd: process.cwd(), settings: { next: { rootDir: pattern } } });

test("patched Next root lookup preserves supported directory/glob/Windows junction configurations", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "sprint1-next-roots-"));
  const old = process.cwd();
  try {
    for (const name of [
      "apps/web/pages",
      "apps/api",
      "apps/.hidden",
      "numeric/01",
      "numeric/02",
      "numeric/03",
    ])
      mkdirSync(resolve(dir, name), { recursive: true });
    writeFileSync(resolve(dir, "apps/file"), "not a directory");
    symlinkSync(
      resolve(dir, "apps/web"),
      resolve(dir, "junction"),
      process.platform === "win32" ? "junction" : "dir",
    );
    process.chdir(dir);
    const sorted = (pattern) =>
      roots(pattern)
        .map((x) => x.replaceAll("\\", "/").replace(/\/$/, ""))
        .sort();
    assert.deepEqual(getRootDirs({ cwd: dir, settings: {} }), [dir]);
    assert.deepEqual(sorted("apps/{web,api}"), ["apps/api", "apps/web"]);
    assert.deepEqual(sorted(["apps/api", 3, "apps/web"]), [
      "apps/api",
      "apps/web",
    ]);
    assert.deepEqual(sorted("apps/*"), ["apps/api", "apps/web"]);
    assert.deepEqual(sorted("apps/.*"), ["apps/.hidden"]);
    assert.deepEqual(sorted("apps/web/**"), ["apps/web/pages"]);
    assert.deepEqual(sorted("numeric/{01..03}"), [
      "numeric/01",
      "numeric/02",
      "numeric/03",
    ]);
    assert.deepEqual(sorted("junction/**"), ["junction/pages"]);
    assert.equal(roots(resolve(dir, "junction")).length, 1);
    assert.deepEqual(sorted("apps/no-match"), []);
    assert.deepEqual(sorted("apps/file"), []);
    assert.deepEqual(sorted("!apps/web"), []);
    assert.throws(() => roots(""), TypeError);
    for (const hostile of [
      "{".repeat(2000) + "a,b" + "}".repeat(2000),
      "x".repeat(4097),
      "apps/{1..1000000000}",
    ])
      assert.throws(() => roots(hostile), RangeError);
    for (const unsupported of [
      'apps/{"web",api}',
      "apps/*/pages/../pages",
      "{apps/web,!apps/api}",
    ])
      assert.throws(() => roots(unsupported), TypeError);
  } finally {
    process.chdir(old);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("real ESLint still reports internal anchor and unrelated Next image rules", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "sprint1-next-eslint-"));
  try {
    mkdirSync(resolve(dir, "pages"));
    writeFileSync(
      resolve(dir, "pages/about.js"),
      "export default function About() { return null; }",
    );
    const { ESLint } = web("eslint");
    const eslint = new ESLint({
      cwd: dir,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ["**/*.jsx"],
          languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
          settings: { next: { rootDir: dir } },
          plugins: { "@next/next": config("@next/eslint-plugin-next") },
          rules: {
            "@next/next/no-html-link-for-pages": "error",
            "@next/next/no-img-element": "error",
          },
        },
      ],
    });
    const [result] = await eslint.lintText(
      'const Page = () => <><a href="/about">About</a><img src="/image.png" alt="Fixture" /></>;',
      { filePath: resolve(dir, "page.jsx") },
    );
    const rules = result.messages.map((message) => message.ruleId);
    assert.ok(
      rules.includes("@next/next/no-html-link-for-pages"),
      JSON.stringify(result.messages),
    );
    assert.ok(
      rules.includes("@next/next/no-img-element"),
      JSON.stringify(result.messages),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
