5s
Run pnpm lint

> event-ticketing-platform@1.0.0 lint /home/runner/work/thudemo/thudemo
> pnpm -r run lint

Scope: 3 of 4 workspace projects
apps/api lint$ oxlint --type-aware src/ test/
apps/web lint$ eslint
apps/api lint: ::warning file=src/app.module.ts,line=13,endLine=13,col=10,endColumn=22,title=eslint(no-unused-vars)::src/app.module.ts:13:10: Identifier 'OrdersModule' is imported but never used.
apps/api lint: ::warning file=test/orders.e2e-spec.ts,line=155,endLine=155,col=12,endColumn=60,title=typescript(require-array-sort-compare)::test/orders.e2e-spec.ts:155:12: Require 'compare' argument.
apps/api lint: Found 2 warnings and 0 errors.
apps/api lint: Finished in 320ms on 42 files with 111 rules using 4 threads.
apps/api lint: Done
apps/web lint: /home/runner/work/thudemo/thudemo/apps/web/src/features/orders/order-summary.tsx
apps/web lint:   50:10  error  Error: Calling setState synchronously within an effect can trigger cascading renders
apps/web lint: Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
apps/web lint: * Update external systems with the latest state from React.
apps/web lint: * Subscribe for updates from some external system, calling setState in a callback function when external state changes.
apps/web lint: Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).
apps/web lint: /home/runner/work/thudemo/thudemo/apps/web/src/features/orders/order-summary.tsx:50:10
apps/web lint:   48 |
apps/web lint:   49 |   useEffect(() => {
apps/web lint: > 50 |     void load().catch((reason) =>
apps/web lint:      |          ^^^^ Avoid calling setState() directly within an effect
apps/web lint:   51 |       setError(
apps/web lint:   52 |         reason instanceof Error
apps/web lint:   53 |           ? reason.message  react-hooks/set-state-in-effect
apps/web lint: ✖ 1 problem (1 error, 0 warnings)
apps/web lint: Failed
/home/runner/work/thudemo/thudemo/apps/web:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  web@0.1.0 lint: `eslint`
Exit status 1
 ELIFECYCLE  Command failed with exit code 1.
Error: Process completed with exit code 1.
0s
0s
0s
