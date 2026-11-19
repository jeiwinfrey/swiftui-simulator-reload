#!/usr/bin/env node

import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";

const execute = promisify(execFile);
const run = async (program, ...args) => (await execute(program, args)).stdout.trim();
const simctl = (...args) => run("xcrun", "simctl", ...args);

async function selectDevice(udid) {
  const { devices } = JSON.parse(await simctl("list", "devices", "available", "--json"));
  const iphones = Object.values(devices).flat().filter((device) => device.name.startsWith("iPhone"));
  if (udid) {
    const selected = iphones.find((device) => device.udid.toLowerCase() === udid.toLowerCase());
    if (selected) return selected;
    throw new Error(`No available iPhone simulator matches ${udid}.`);
  }

  const booted = iphones.filter((device) => device.state === "Booted");
  const candidates = booted.length ? booted : iphones;
  if (candidates.length === 1) return candidates[0];
  if (!candidates.length) throw new Error("No iPhone simulator is available. Install an iOS simulator runtime in Xcode.");
  throw new Error("Pass --device <UDID> to choose an iPhone. List devices with xcrun simctl list devices available.");
}

async function launch(options, appArguments) {
  const app = options.app ? resolve(options.app) : null;
  if (app && (!app.endsWith(".app") || !(await stat(app)).isDirectory())) {
    throw new Error("--app must point to a built iOS Simulator .app directory.");
  }
  const bundle = app
    ? await run("plutil", "-extract", "CFBundleIdentifier", "raw", "-o", "-", join(app, "Info.plist"))
    : options.bundle;
  if (!/^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)+$/.test(bundle)) {
    throw new Error("Provide a valid app bundle identifier.");
  }

  const device = await selectDevice(options.device);
  if (device.state === "Shutdown") await simctl("boot", device.udid);
  if (device.state !== "Booted") await simctl("bootstatus", device.udid, "-b");
  if (app) await simctl("install", device.udid, app);
  const developerDirectory = await run("xcode-select", "-p");
  await run("open", "-a", join(developerDirectory, "Applications", "Simulator.app"));
  console.log(await simctl("launch", device.udid, bundle, ...appArguments));
  console.log(`Launched ${bundle} on ${device.name} (${device.udid}).`);
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      app: { type: "string" },
      bundle: { type: "string" },
      device: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log("Usage: node launch-app.mjs (--bundle <bundle-id> | --app <built.app>) [--device <UDID>] [-- <app arguments>]");
  } else if (Boolean(values.app) === Boolean(values.bundle)) {
    throw new Error("Pass either --bundle for an installed app or --app for a built .app.");
  } else {
    await launch(values, positionals);
  }
} catch (error) {
  console.error(error.stderr?.trim() || error.message);
  process.exitCode = 1;
}
