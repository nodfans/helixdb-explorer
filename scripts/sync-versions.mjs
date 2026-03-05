#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");

const jsonFiles = [
  "package.json",
  "packages/app/package.json",
  "packages/desktop/package.json",
  "packages/desktop/src-tauri/tauri.conf.json",
];

const cargoFiles = [
  "packages/desktop/src-tauri/Cargo.toml",
  "packages/desktop/seed/Cargo.toml",
];

function readJson(relPath) {
  const absPath = path.join(root, relPath);
  const content = fs.readFileSync(absPath, "utf8");
  return JSON.parse(content);
}

function writeJson(relPath, json) {
  const absPath = path.join(root, relPath);
  fs.writeFileSync(absPath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
}

function updateCargoVersion(relPath, version) {
  const absPath = path.join(root, relPath);
  const content = fs.readFileSync(absPath, "utf8");
  const next = content.replace(/(\[package\][\s\S]*?\nversion\s*=\s*")([^"]+)(")/, `$1${version}$3`);

  if (next === content) {
    throw new Error(`Could not find [package] version in ${relPath}`);
  }

  if (!checkOnly) {
    fs.writeFileSync(absPath, next, "utf8");
  }

  return content !== next;
}

function main() {
  const rootPkg = readJson("package.json");
  const expectedVersion = rootPkg.version;

  if (!expectedVersion) {
    throw new Error("Root package.json is missing version field");
  }

  let mismatch = false;

  for (const relPath of jsonFiles) {
    const data = readJson(relPath);
    if (data.version !== expectedVersion) {
      mismatch = true;
      if (checkOnly) {
        console.error(`[version-check] ${relPath}: ${data.version} != ${expectedVersion}`);
      } else {
        data.version = expectedVersion;
        writeJson(relPath, data);
        console.log(`[version-sync] updated ${relPath} -> ${expectedVersion}`);
      }
    }
  }

  for (const relPath of cargoFiles) {
    const absPath = path.join(root, relPath);
    const content = fs.readFileSync(absPath, "utf8");
    const match = content.match(/\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/);

    if (!match) {
      throw new Error(`Could not read [package] version in ${relPath}`);
    }

    if (match[1] !== expectedVersion) {
      mismatch = true;
      if (checkOnly) {
        console.error(`[version-check] ${relPath}: ${match[1]} != ${expectedVersion}`);
      } else {
        updateCargoVersion(relPath, expectedVersion);
        console.log(`[version-sync] updated ${relPath} -> ${expectedVersion}`);
      }
    }
  }

  if (checkOnly && mismatch) {
    process.exit(1);
  }

  if (!mismatch) {
    console.log(`[version-${checkOnly ? "check" : "sync"}] all versions aligned at ${expectedVersion}`);
  }
}

main();
