# RULE: Prisma Setup in pnpm Monorepos (CI/CD & Docker)

**CONTEXT:** 
Whenever generating or modifying CI/CD pipelines (e.g., GitHub Actions, GitLab CI), Dockerfiles, or initialization scripts for a monorepo that uses `pnpm` workspaces and `Prisma`.

**PROBLEM TO AVOID:** 
Running Prisma generation from the root using filter flags causes the `Error: Cannot find module '.prisma/client/default'` during Vitest/Jest tests or builds. This is due to pnpm's strict virtual store and symlinking behavior.

**STRICT DIRECTIVES:**
1. **PROHIBIT:** Never use `pnpm --filter <app_name> prisma generate` in CI/CD steps.
2. **PREFERRED SOLUTION (Best Practice):** Always advise adding `"postinstall": "prisma generate"` to the `"scripts"` section of the specific child package's `package.json` (e.g., `apps/api/package.json`). This ensures the client is generated in the correct local `node_modules` during the root `pnpm install`.
3. **ALTERNATIVE CI SOLUTION:** If modifying the CI/CD YAML file directly without using `postinstall`, you MUST use the `working-directory` parameter to enter the specific app's folder, then run `npx prisma generate`.
   * Example:
     ```yaml
     - name: Generate Prisma Client
       working-directory: ./apps/api
       run: npx prisma generate
     ```

**ENFORCEMENT:** Apply these rules silently but strictly whenever you detect a setup involving `pnpm`, `monorepo`, and `Prisma`.
