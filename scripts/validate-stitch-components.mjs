import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

// Project adapter for the Google Labs AST workflow: Next.js/domain conventions
// take precedence over the sample Vite/mockData/mandatory-Props rules.
const files = process.argv.slice(2);
if (!files.length) throw new Error("Provide the TSX files to review.");
const results = files.map((file) => {
  const source = readFileSync(resolve(file), "utf8");
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const issues = ast.parseDiagnostics.map((item) =>
    ts.flattenDiagnosticMessageText(item.messageText, " "),
  );
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword)
      issues.push("Explicit any type");
    if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      if (node.name.getText(ast) === "href" && node.initializer.text === "#")
        issues.push("Placeholder navigation");
      if (
        node.name.getText(ast) === "className" &&
        /#[0-9a-f]{3,8}\b/i.test(node.initializer.text)
      )
        issues.push("Inline hex token in JSX");
    }
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      /react-router|mockData/.test(node.moduleSpecifier.text)
    )
      issues.push("Unsupported routing/mock product data");
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return { file, issues, pass: issues.length === 0 };
});
console.log(
  JSON.stringify(
    { adapter: "TypeScript AST; approved Next.js overrides", results },
    null,
    2,
  ),
);
if (results.some((result) => !result.pass)) process.exitCode = 1;
