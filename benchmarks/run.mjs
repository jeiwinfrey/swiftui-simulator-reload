#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

const execute = promisify(execFile);
const bundle = "dev.swiftui-reload.benchmark";
const scheme = "BenchmarkApp";
const fixture = fileURLToPath(new URL("./BenchmarkApp/", import.meta.url));
const sweetpad = process.env.SWEETPAD_BIN || "sweetpad";

async function run(command, args) {
  const result = await execute(command, args, { maxBuffer: 8 * 1024 * 1024 });
  return result.stdout.trim();
}

const sim = (...args) => run("xcrun", ["simctl", ...args]);

async function readMark(directory) {
  const path = join(directory, "Documents", "benchmark-ready.txt");
  const mark = await readFile(path, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const [revision, pid] = mark.trim().split(" ");
  return { revision, pid };
}

async function awaitRevision(directory, revision, timeout, child) {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (child?.exitCode != null || child?.signalCode != null) {
      throw new Error("SweetPad exited before the view updated.");
    }
    const { revision: current, pid } = await readMark(directory);
    if (current === revision && /^\d+$/.test(pid ?? "")) return pid;
    await delay(25);
  }
  throw new Error(`Simulator did not acknowledge ${revision} within ${timeout / 1000} seconds.`);
}

function summarize(samples) {
  const sorted = samples.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { samplesMs: samples.map(Math.round), medianMs: Math.round(median) };
}

async function installedContainer(device) {
  try {
    return await sim("get_app_container", device, bundle, "data");
  } catch (error) {
    if (/No such file|not installed/i.test(error.stderr ?? "")) return null;
    throw error;
  }
}

async function awaitContainer(device, child) {
  for (let attempt = 0; attempt < 240; attempt++) {
    if (child.exitCode != null || child.signalCode != null) throw new Error("SweetPad failed to launch the app.");
    const directory = await installedContainer(device);
    if (directory) return directory;
    await delay(400);
  }
  throw new Error("SweetPad did not install the fixture.");
}

async function awaitInjectionConnection(child, output) {
  const deadline = performance.now() + 30000;
  while (performance.now() < deadline) {
    if (child.exitCode != null || child.signalCode != null) break;
    if (/^\[hot\] Connected\b/m.test(output())) return;
    await delay(100);
  }
  throw new Error("SweetPad did not report a connected injector.");
}

async function benchmark({ device, count, mode, recompiler }) {
  const { devices } = JSON.parse(await sim("list", "devices", "booted", "--json"));
  const selected = Object.values(devices).flat()
    .find((entry) => entry.udid === device && entry.name.startsWith("iPhone"));
  if (!selected) throw new Error("Supply the UDID of a booted iPhone simulator.");
  if (await installedContainer(device)) {
    throw new Error(`The benchmark app (${bundle}) is already installed. Use a spare simulator or remove that fixture first.`);
  }

  const versions = {
    xcode: (await run("xcodebuild", ["-version"])).replaceAll("\n", " "),
    sweetpad: mode === "rebuild" ? null : await run(sweetpad, ["--version"]),
  };
  const scratch = await mkdtemp(join(await realpath(tmpdir()), "swiftui-reload-bench-"));
  const projectDirectory = join(scratch, "Fixture");
  const project = join(projectDirectory, "BenchmarkApp.xcodeproj");
  const source = join(projectDirectory, "BenchmarkApp", "ContentView.swift");
  const derived = join(scratch, "DerivedData");
  const app = join(derived, "Build", "Products", "Debug-iphonesimulator", `${scheme}.app`);
  const results = { simulator: selected.name, versions, rebuild: null, hotReload: null };
  let child;
  let diagnostics = "";
  let childError;

  try {
    await cp(fixture, projectDirectory, { recursive: true });
    const original = await readFile(source, "utf8");
    const save = (revision) => writeFile(source, original.replace("BENCH-0000", revision));
    const revisionAt = (index) => `BENCH-${String(index).padStart(4, "0")}`;

    if (mode !== "hot") {
      const buildAndLaunch = async () => {
        await run("xcodebuild", [
          "-project", project, "-scheme", scheme, "-configuration", "Debug",
          "-destination", `id=${device}`, "-derivedDataPath", derived,
          "CODE_SIGNING_ALLOWED=NO", "-quiet", "build",
        ]);
        await sim("terminate", device, bundle).catch(() => {});
        await sim("install", device, app);
        const directory = await sim("get_app_container", device, bundle, "data");
        await sim("launch", device, bundle);
        return directory;
      };

      process.stderr.write("Warming the Xcode build and Simulator app.\n");
      const directory = await buildAndLaunch();
      let pid = await awaitRevision(directory, revisionAt(0), 15000);
      const samples = [];
      for (let index = 1; index <= count + 1; index++) {
        const revision = revisionAt(index);
        const start = performance.now();
        await save(revision);
        const container = await buildAndLaunch();
        const nextPid = await awaitRevision(container, revision, 15000);
        if (nextPid === pid) throw new Error("The rebuild sample did not start a new app process.");
        pid = nextPid;
        if (index > 1) samples.push(performance.now() - start);
      }
      results.rebuild = summarize(samples);
      await sim("terminate", device, bundle);
      await sim("uninstall", device, bundle);
    }

    if (mode !== "rebuild") {
      process.stderr.write(`Starting SweetPad with the ${recompiler} recompiler.\n`);
      const warm = revisionAt(1000);
      await save(warm);
      child = spawn(sweetpad, [
        "run", "--hot", "--hot-recompiler", recompiler, "--on", device, "--project", project,
        "--scheme", scheme, "--configuration", "Debug", "--non-interactive", "--no-color",
        "--", "-derivedDataPath", derived, "CODE_SIGNING_ALLOWED=NO",
      ], { cwd: projectDirectory, stdio: ["ignore", "pipe", "pipe"] });
      child.on("error", (error) => { childError = error; });
      const append = (chunk) => { diagnostics = (diagnostics + chunk).slice(-35000); };
      child.stdout.on("data", append);
      child.stderr.on("data", append);

      const directory = await awaitContainer(device, child);
      const pid = await awaitRevision(directory, warm, 20000, child);
      await awaitInjectionConnection(child, () => diagnostics);
      const samples = [];
      for (let index = 1; index <= count + 1; index++) {
        const revision = revisionAt(1000 + index);
        const start = performance.now();
        await save(revision);
        const nextPid = await awaitRevision(directory, revision, 20000, child);
        if (nextPid !== pid) throw new Error("The hot-reload sample relaunched the app.");
        if (index > 1) samples.push(performance.now() - start);
      }
      results.hotReload = { recompiler, ...summarize(samples) };
    }
    return results;
  } catch (error) {
    if (diagnostics) console.error(diagnostics.trim());
    throw childError ?? error;
  } finally {
    if (child?.pid && child.exitCode == null && child.signalCode == null) {
      child.kill("SIGINT");
      for (let attempt = 0; attempt < 20 && child.exitCode == null && child.signalCode == null; attempt++) {
        await delay(100);
      }
      if (child.exitCode == null && child.signalCode == null) child.kill("SIGTERM");
    }
    await sim("uninstall", device, bundle).catch(() => {});
    await rm(scratch, { recursive: true, force: true });
  }
}

try {
  const { values } = parseArgs({
    options: {
      device: { type: "string" },
      runs: { type: "string", default: "5" },
      mode: { type: "string", default: "both" },
      recompiler: { type: "string", default: "buildlog" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log("Usage: node benchmarks/run.mjs --device <booted-UDID> [--runs 5] [--mode both|rebuild|hot] [--recompiler buildlog|resolver]");
  } else {
    const count = Number(values.runs);
    if (!values.device || !Number.isInteger(count) || count < 1 || count > 30
        || !["both", "rebuild", "hot"].includes(values.mode)
        || !["buildlog", "resolver"].includes(values.recompiler)) {
      throw new Error("Provide a booted simulator UDID and valid benchmark options. See --help.");
    }
    console.log(JSON.stringify(await benchmark({
      device: values.device, count, mode: values.mode, recompiler: values.recompiler,
    }), null, 2));
  }
} catch (error) {
  console.error(error.stderr?.trim() || error.message);
  process.exitCode = 1;
}
