# Next ESLint root-directory lookup patch

`@next/eslint-plugin-next@16.3.8` pins fast-glob3.3.1 → micromatch4.0.8 → braces3.0.3. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no upstream patched braces release at review time (16/10/2026). Next's only fast-glob caller locates configured application roots for `no-html-link-for-pages`.

The pnpm patch replaces only that helper's matcher with glob13.0.6 and brace-expansion5.0.12. The scoped override removes fast-glob from this one package; packageExtensions declare the replacements. Every Next ESLint rule remains enabled. Default context.cwd behavior is unchanged.

Root configuration bounds fail with explicit errors before globbing: 4096 characters, 128 brace groups, 64 nesting levels, 1000 expansions. Quoted brace terms, wildcard paths containing parent segments and mixed negative brace branches are explicitly unsupported rather than reinterpreted. Ordinary alternatives, ranges, absolute paths, monorepo roots, directory filtering, dot paths, terminal globstars and Windows junctions are checked by `deploy/next-root-dirs.spec.mjs`. Existing project config supplies no custom rootDir.

Verify with `node --test deploy/next-root-dirs.spec.mjs`, `pnpm lint`, frozen install and production/full audits. The test executes actual Next rules and checks internal-anchor plus image diagnostics. Docker copies the patch before its frozen installation. Reassess/remove this local patch only when a compatible upstream plugin no longer pulls the affected dependency.
