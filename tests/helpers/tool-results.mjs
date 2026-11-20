import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Existing non-deletion suites isolate the new persistence boundary. The result
// deletion suite exercises the real module, initialization and SQL together.
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../lib/tool-result-deletion.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, require: () => ({}) });
export function toolResultsMock(name) {
  if (name === './tool-result-deletion') return { ...exports, ensureToolResultDeletions: async () => {} };
  if (name === './tool-result-delete') return { ToolResultDelete: () => null };
}
