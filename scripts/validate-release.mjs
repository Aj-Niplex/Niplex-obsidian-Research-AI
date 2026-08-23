import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

function run(command, args) {
	console.log(`\n> ${command} ${args.join(" ")}`);
	execFileSync(command, args, { stdio: "inherit" });
}

run("npm", ["test"]);
run("npm", ["run", "build"]);
run("npm", ["run", "lint"]);
run("npm", ["audit", "--omit=dev", "--audit-level=high"]);

const required = ["main.js", "manifest.json", "styles.css"];
for (const file of required) {
	if (statSync(file).size === 0) throw new Error(`${file} is empty`);
}
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
if (typeof manifest.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(manifest.id) || manifest.id.includes("obsidian")) {
	throw new Error(`Manifest id is not Community Plugins-safe: ${String(manifest.id)}`);
}
const bundle = readFileSync("main.js", "utf8");
for (const forbidden of ["OPENAI_API_BASE", 'from "node:', 'from "electron']) {
	if (bundle.includes(forbidden)) throw new Error(`Forbidden runtime dependency found in bundle: ${forbidden}`);
}
console.log("\nLocal release validation passed. No GitHub Actions runner is required.");
