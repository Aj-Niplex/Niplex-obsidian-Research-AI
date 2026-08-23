import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const output = resolve(process.argv[2] || "dist/niplex-agentic-research.zip");
mkdirSync(dirname(output), { recursive: true });
rmSync(output, { force: true });
execFileSync("zip", ["-j", "-q", output, "main.js", "manifest.json", "styles.css"], { stdio: "inherit" });
console.log(`Packaged ${output}`);
