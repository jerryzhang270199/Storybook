import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const REQUIRED_DOUBAO_ENV_VALUES = [
  "DOUBAO_API_KEY",
  "DOUBAO_STORY_MODEL",
  "DOUBAO_IMAGE_MODEL",
] as const;

type DockerStatus = {
  available: boolean;
  detail: string;
};

function stripEnvQuotes(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function readEnvValue(source: string, key: string) {
  const match = source.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, "m"));
  return match ? stripEnvQuotes(match[1] ?? "") : "";
}

export function buildLocalEnvContent(template: string) {
  return `${template.trimEnd()}\n`;
}

export function getEmptyRequiredLocalValues(source: string) {
  return REQUIRED_DOUBAO_ENV_VALUES.filter((key) => !readEnvValue(source, key));
}

export function getDockerStatus(): DockerStatus {
  const docker = spawnSync("docker", ["--version"], {
    encoding: "utf8",
  });
  if (docker.error || docker.status !== 0) {
    return {
      available: false,
      detail: "Docker command is unavailable. Install Docker Desktop or use your own PostgreSQL.",
    };
  }

  const compose = spawnSync("docker", ["compose", "version"], {
    encoding: "utf8",
  });
  if (compose.error || compose.status !== 0) {
    return {
      available: false,
      detail: "Docker is installed, but `docker compose` is unavailable.",
    };
  }

  return {
    available: true,
    detail: (compose.stdout || docker.stdout).trim(),
  };
}

async function pathExists(filePath: string) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const envPath = path.join(process.cwd(), ".env");
  const templatePath = path.join(process.cwd(), ".env.example");

  let envContent: string;
  if (await pathExists(envPath)) {
    envContent = await readFile(envPath, "utf8");
    console.log(".env already exists; leaving it unchanged.");
  } else {
    const template = await readFile(templatePath, "utf8");
    envContent = buildLocalEnvContent(template);
    await writeFile(envPath, envContent, { flag: "wx" });
    console.log("Created .env from .env.example.");
  }

  const missingValues = getEmptyRequiredLocalValues(envContent);
  if (missingValues.length > 0) {
    console.log("\nNext: fill these Doubao values in .env:");
    for (const value of missingValues) {
      console.log(`- ${value}`);
    }
  } else {
    console.log("\nRequired Doubao values are filled.");
  }

  const docker = getDockerStatus();
  if (docker.available) {
    console.log(`\nDocker ready: ${docker.detail}`);
  } else {
    console.warn(`\nDocker check: ${docker.detail}`);
  }

  console.log("\nThen run:");
  console.log("npm run setup:local");
  console.log("npm run dev");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
