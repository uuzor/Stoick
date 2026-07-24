import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outRoot = resolve(root, "clmm-frontend/public/clmm-artifacts");

const circuits = [
  "clmm_mint",
  "clmm_swap_exact_in",
  "clmm_collect",
  "clmm_burn",
];

for (const circuit of circuits) {
  const outDir = resolve(outRoot, circuit);
  mkdirSync(outDir, { recursive: true });

  for (const name of ["proof", "public_inputs", "vk"]) {
    copyFileSync(resolve(root, `circuits/artifacts/${circuit}/${name}`), resolve(outDir, name));
  }

  copyFileSync(
    resolve(root, `circuits/noir/${circuit}/target/${circuit}.json`),
    resolve(outDir, `${circuit}.json`),
  );
}

console.log(`synced ${circuits.length} CLMM artifact sets to ${outRoot}`);
