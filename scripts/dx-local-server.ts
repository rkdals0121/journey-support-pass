/** Local browser-check server. Keeps all deployment credentials out of the child environment. */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
if (!fs.existsSync(path.join(root, ".next", "BUILD_ID")))
  throw new Error("Run npm run build first.");
const require = createRequire(import.meta.url);
const child = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: "",
      POSTGRES_URL: "",
      VERCEL: "",
      DATA_MODE: "mock",
      ICN_API_KEY: "",
      EXTERNAL_CONNECTION_MODE: "",
      CRON_SECRET: "dx-local-check-only",
      SESSION_SECRET: "dx-local-check-only-session-not-for-deployment",
      BASE_URL: "http://localhost:3100",
      JSP_LOCAL_DB_DIR: path.join(root, ".data", "dx-browser-checks"),
      WEB_PUSH_PUBLIC_KEY: "",
      WEB_PUSH_PRIVATE_KEY: "",
      WEB_PUSH_SUBJECT: "",
    },
  },
);
child.on("error", () => {
  console.error("Could not start the isolated local server.");
  process.exit(1);
});
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", (code) => process.exit(code ?? 1));
