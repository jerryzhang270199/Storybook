import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { getBlockingLocalReadinessIssues, getLocalReadinessIssues } from "../src/lib/local-readiness";

const envPath = path.join(process.cwd(), ".env");
config({ path: envPath, quiet: true });

if (!existsSync(envPath)) {
  console.error("缺少 .env。请先运行：npm run init:local");
  process.exit(1);
}

const blockingIssues = getBlockingLocalReadinessIssues();
if (blockingIssues.length > 0) {
  console.error("本地配置还没完成：");
  for (const issue of blockingIssues) {
    console.error(`- ${issue}`);
  }
  console.error("\n请查看 docs/doubao-setup.zh-CN.md，修改 .env 后重新运行 npm run doctor。");
  process.exit(1);
}

for (const issue of getLocalReadinessIssues().filter((issue) => issue.startsWith("DOUBAO_TTS_API_KEY"))) {
  console.warn(issue);
}

console.log("本地配置检查通过。");
