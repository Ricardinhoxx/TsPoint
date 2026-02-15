import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const target = join(process.cwd(), "node_modules", "next", "dist", "lib", "recursive-delete.js");

if (!existsSync(target)) {
  process.exit(0);
}

const marker = "// patched-onedrive-einval";
const src = readFileSync(target, "utf8");
if (src.includes(marker)) {
  process.exit(0);
}

const before = "const linkPath = await _fs.promises.readlink(absolutePath);";
const after = [
  "let linkPath = '';",
  "            try {",
  "                linkPath = await _fs.promises.readlink(absolutePath);",
  "            } catch (e) {",
  "                const code = (0, _iserror.default)(e) && e.code;",
  "                if (code === 'EINVAL') {",
  "                    // patched-onedrive-einval",
  "                    isDirectory = false;",
  "                    return;",
  "                }",
  "                throw e;",
  "            }"
].join("\n");

if (!src.includes(before)) {
  console.warn("[patch-next] Pattern not found; skipping patch.");
  process.exit(0);
}

const out = src.replace(before, after);
writeFileSync(target, out, "utf8");
console.log("[patch-next] Applied OneDrive EINVAL patch to Next recursive-delete.");
