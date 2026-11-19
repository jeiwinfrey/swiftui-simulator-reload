#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { watch } from "node:fs";
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

const execute = promisify(execFile);
const tool = fileURLToPath(new URL(".", import.meta.url));
const run = async (program, ...args) => (await execute(program, args)).stdout.trim();
const simctl = (...args) => run("xcrun", "simctl", ...args);
const swift = (...args) => run("xcrun", "--sdk", "iphonesimulator", "swiftc", ...args);

async function readProject(path) {
  const configPath = join(path, "NativePreview", "preview.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const paths = (key, items) => {
    if (!Array.isArray(items) || items.some((item) => typeof item !== "string" || !item)) {
      throw new Error(`${key} must be an array of file paths relative to the project.`);
    }
    return [...new Set(items.map((item) => resolve(path, item)))];
  };
  const sources = paths("sources", config.sources);
  const resources = paths("resources", config.resources ?? []);
  const minimum = config.deploymentTarget ?? "17.0";
  if (typeof minimum !== "string" || !/^\d+\.\d+(?:\.\d+)?$/.test(minimum)) {
    throw new Error('deploymentTarget must be a version string such as "17.0".');
  }
  if (!sources.length || sources.some((source) => !source.endsWith(".swift"))) {
    throw new Error("List at least one Swift source file, including the previewRoot adapter.");
  }
  for (const source of sources) {
    if (!(await stat(source)).isFile()) throw new Error(`Expected a Swift source file at ${source}.`);
  }
  const resourceNames = resources.map((resource) => basename(resource).toLowerCase());
  const reserved = ["info.plist", "previewhost", "_codesignature"];
  if (new Set(resourceNames).size !== resourceNames.length || resourceNames.some((name) => reserved.includes(name))) {
    throw new Error("Each resource needs a unique bundle file name that is separate from the host files.");
  }
  return { sources, resources, minimum };
}

async function findDevice(udid) {
  const { devices } = JSON.parse(await simctl("list", "devices", "booted", "--json"));
  const iphones = Object.values(devices).flat().filter((device) => device.name.startsWith("iPhone"));
  const matches = udid ? iphones.filter((device) => device.udid === udid) : iphones;
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error("Select one booted iPhone by passing --device <UDID>.");
  throw new Error("Boot the desired iPhone in Simulator and run the launcher again.");
}

function infoPlist(bundle, minimum) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${bundle}</string>
<key>CFBundleName</key><string>Native SwiftUI Preview</string>
<key>CFBundleExecutable</key><string>PreviewHost</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>MinimumOSVersion</key><string>${minimum}</string>
<key>UIDeviceFamily</key><array><integer>1</integer></array>
<key>UILaunchScreen</key><dict/>
</dict></plist>`;
}

async function selectLibrary(directory, library) {
  const request = randomUUID();
  const temporary = join(directory, `selection-${request}.tmp`);
  await writeFile(temporary, JSON.stringify({ screen: "root", library, request }));
  await rename(temporary, join(directory, "selection.json"));
  return request;
}

async function waitForMount(directory, request) {
  for (let attempt = 0; attempt < 75; attempt++) {
    const ready = await readFile(join(directory, "ready.json"), "utf8").catch(() => "");
    if (ready.includes(request)) return;
    await delay(80);
  }
  throw new Error("The running preview did not acknowledge the swap. Check that the preview app is open in Simulator.");
}

function watchSources(sources, reload) {
  const byDirectory = new Map();
  for (const source of sources) {
    const directory = dirname(source);
    if (!byDirectory.has(directory)) byDirectory.set(directory, new Set());
    byDirectory.get(directory).add(basename(source));
  }
  let timeout;
  let inFlight;
  let dirty = false;
  let stopped = false;

  function schedule() {
    dirty = true;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      if (inFlight || stopped) return;
      dirty = false;
      inFlight = reload().catch((error) => {
        console.error(error.stderr?.trim() || error.message);
      }).finally(() => {
        inFlight = undefined;
        if (dirty && !stopped) schedule();
      });
    }, 160);
  }

  const watchers = [];
  const close = () => {
    stopped = true;
    clearTimeout(timeout);
    for (const watcher of watchers) watcher.close();
  };
  try {
    for (const [directory, files] of byDirectory) {
      const watcher = watch(directory, (_, name) => {
        if (name === null || files.has(name)) schedule();
      });
      watcher.on("error", (error) => console.error(error.message));
      watchers.push(watcher);
    }
  } catch (error) {
    close();
    throw error;
  }

  return async () => {
    close();
    await inFlight;
  };
}

async function start(path, udid) {
  const config = await readProject(path);
  const device = await findDevice(udid);
  const sdk = await run("xcrun", "--sdk", "iphonesimulator", "--show-sdk-path");
  const architecture = process.arch === "x64" ? "x86_64" : process.arch;
  const target = `${architecture}-apple-ios${config.minimum}-simulator`;
  const swiftSettings = ["-parse-as-library", "-target", target, "-sdk", sdk];
  const projectId = createHash("sha256").update(path).digest("hex").slice(0, 12);
  const bundle = `dev.local.swiftui-preview.p${projectId}`;
  const scratch = await mkdtemp(join(tmpdir(), "swiftui-preview-"));
  let stop;

  async function compile() {
    const version = randomUUID().replaceAll("-", "");
    const filename = `Preview_${version}.dylib`;
    const file = join(scratch, filename);
    await swift(...swiftSettings, "-module-name", `NativePreview_${version}`, "-emit-library",
      ...config.sources, join(tool, "Entry.swift"), "-o", file);
    return { filename, file };
  }

  try {
    // Validate the view before replacing a previously installed host.
    const initial = await compile();
    const app = join(scratch, "PreviewHost.app");
    await mkdir(app);
    await swift(...swiftSettings, join(tool, "Host.swift"), "-o", join(app, "PreviewHost"));
    await writeFile(join(app, "Info.plist"), infoPlist(bundle, config.minimum));
    for (const resource of config.resources) {
      await cp(resource, join(app, basename(resource)), { recursive: true, dereference: true });
    }

    await simctl("terminate", device.udid, bundle).catch(() => {});
    await simctl("install", device.udid, app);
    const data = await simctl("get_app_container", device.udid, bundle, "data");
    const directory = join(data, "Documents", "Canvas");
    await mkdir(directory, { recursive: true });
    for (const name of await readdir(directory)) {
      if (/^Preview_[0-9a-f]+\.dylib$/.test(name)) await rm(join(directory, name));
    }
    await copyFile(initial.file, join(directory, initial.filename));
    const request = await selectLibrary(directory, initial.filename);
    await run("open", "-a", "Simulator");
    const processInfo = await simctl("launch", device.udid, bundle);
    await waitForMount(directory, request);

    stop = watchSources(config.sources, async () => {
      const started = performance.now();
      const next = await compile();
      try {
        await copyFile(next.file, join(directory, next.filename));
        const request = await selectLibrary(directory, next.filename);
        await waitForMount(directory, request);
        console.log(`Hot reload mounted in ${Math.round(performance.now() - started)} ms.`);
      } finally {
        await rm(next.file, { force: true });
      }
    });
    console.log(`Ready on ${device.name} (${processInfo}). Watching ${config.sources.length} Swift files.`);
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  } finally {
    await stop?.();
    await rm(scratch, { recursive: true, force: true });
  }
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { device: { type: "string" }, help: { type: "boolean", short: "h" } },
  });
  if (values.help) {
    console.log("Usage: node run.mjs <project-directory> [--device <booted-iPhone-UDID>]");
  } else if (positionals.length !== 1) {
    throw new Error("Pass a project directory with NativePreview/preview.json. Use --help for usage.");
  } else {
    await start(resolve(positionals[0]), values.device);
  }
} catch (error) {
  console.error(error.stderr?.trim() || error.message);
  process.exitCode = 1;
}
