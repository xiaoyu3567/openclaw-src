#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const isWindows = process.platform === "win32";
const backupRoot = path.join(os.homedir(), ".openclaw", "deploy-backups");

function parseArgs(argv) {
  const args = {
    action: "",
    scope: "",
    yes: false,
    dryRun: false,
    branch: "",
    backupId: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case "--action":
        args.action = argv[i + 1] ?? "";
        i += 1;
        break;
      case "--scope":
        args.scope = argv[i + 1] ?? "";
        i += 1;
        break;
      case "--yes":
        args.yes = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--branch":
        args.branch = argv[i + 1] ?? "";
        i += 1;
        break;
      case "--backup-id":
        args.backupId = argv[i + 1] ?? "";
        i += 1;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        break;
    }
  }
  return args;
}

function printHelp() {
  console.log(`OpenClaw Deploy Assistant

Usage:
  scripts/deploy.sh
  node scripts/deploy-assistant.mjs --action deploy-ui --yes

Actions:
  deploy-recommended   Deploy UI only (recommended)
  deploy-ui            Deploy UI only
  deploy-full          Deploy UI + backend dist
  rollback             Roll back using --backup-id
  health               Run health checks
`);
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  return result.status ?? 1;
}

function runDeploy(scope, options) {
  if (isWindows) {
    const scriptPath = path.join(scriptDir, "deploy-core.ps1");
    const psArgs = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-Scope",
      scope,
    ];
    if (options.yes) {
      psArgs.push("-Yes");
    }
    if (options.dryRun) {
      psArgs.push("-DryRun");
    }
    if (options.branch) {
      psArgs.push("-Branch", options.branch);
    }
    return runCommand("powershell", psArgs);
  }

  const scriptPath = path.join(scriptDir, "deploy-core.sh");
  const shArgs = [scriptPath, "--scope", scope];
  if (options.yes) {
    shArgs.push("--yes");
  }
  if (options.dryRun) {
    shArgs.push("--dry-run");
  }
  if (options.branch) {
    shArgs.push("--branch", options.branch);
  }
  return runCommand("bash", shArgs);
}

function runRollback(backupId) {
  if (!backupId) {
    console.error("Error: backup id is required for rollback.");
    return 1;
  }

  if (isWindows) {
    const scriptPath = path.join(scriptDir, "rollback.ps1");
    return runCommand("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-BackupId",
      backupId,
    ]);
  }

  const scriptPath = path.join(scriptDir, "rollback.sh");
  return runCommand("bash", [scriptPath, "--id", backupId]);
}

function runHealth() {
  if (isWindows) {
    const scriptPath = path.join(scriptDir, "deploy-core.ps1");
    return runCommand("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-HealthOnly",
    ]);
  }
  const scriptPath = path.join(scriptDir, "deploy-health.sh");
  return runCommand("bash", [scriptPath]);
}

function listBackups() {
  if (!fs.existsSync(backupRoot)) {
    return [];
  }
  return fs
    .readdirSync(backupRoot, { withFileTypes: true })
    .filter((item) => item.isDirectory() && item.name.startsWith("backup-"))
    .map((item) => item.name)
    .toSorted((a, b) => (a > b ? -1 : 1));
}

function renderMenu() {
  console.log("\nOpenClaw Deploy Assistant");
  console.log("=========================");
  console.log("[1] One-click deploy (recommended)");
  console.log("[2] Deploy Web UI only");
  console.log("[3] Full deploy (UI + backend)");
  console.log("[4] Roll back to previous backup");
  console.log("[5] Health check");
  console.log("[0] Exit");
}

async function runInteractive(args) {
  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      renderMenu();
      const choice = (await rl.question("Select an option: ")).trim();
      if (choice === "0") {
        console.log("Bye.");
        return 0;
      }
      if (choice === "1" || choice === "2" || choice === "3") {
        const scope = choice === "3" ? "full" : "ui";
        const confirm = (await rl.question("Proceed? [y/N]: ")).trim().toLowerCase();
        if (confirm !== "y" && confirm !== "yes") {
          console.log("Cancelled.");
          continue;
        }
        const code = runDeploy(scope, { ...args, yes: true });
        if (code !== 0) {
          return code;
        }
        continue;
      }
      if (choice === "4") {
        const backups = listBackups();
        if (backups.length === 0) {
          console.log("No backup found.");
          continue;
        }
        console.log("\nAvailable backups:");
        backups.forEach((item, idx) => {
          console.log(`[${idx + 1}] ${item}`);
        });
        const selected = (await rl.question("Choose backup number: ")).trim();
        const index = Number.parseInt(selected, 10) - 1;
        if (!Number.isInteger(index) || index < 0 || index >= backups.length) {
          console.log("Invalid selection.");
          continue;
        }
        const code = runRollback(backups[index]);
        if (code !== 0) {
          return code;
        }
        continue;
      }
      if (choice === "5") {
        const code = runHealth();
        if (code !== 0) {
          return code;
        }
        continue;
      }
      console.log("Invalid option.");
    }
  } finally {
    rl.close();
  }
}

function runAction(args) {
  switch (args.action) {
    case "deploy-recommended":
      return runDeploy("ui", args);
    case "deploy-ui":
      return runDeploy("ui", args);
    case "deploy-full":
      return runDeploy("full", args);
    case "rollback":
      return runRollback(args.backupId);
    case "health":
      return runHealth();
    default:
      return 2;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.action) {
    const code = runAction(args);
    if (code === 2) {
      printHelp();
      process.exit(2);
    }
    process.exit(code);
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    printHelp();
    process.exit(1);
  }

  const code = await runInteractive(args);
  process.exit(code);
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
