import { spawnSync } from "node:child_process";

run(process.execPath, ["node_modules/typescript/lib/tsc.js", "-p", "tsconfig.json"]);
run(process.execPath, ["--test", "dist/test/agentmigrate.test.js"]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
