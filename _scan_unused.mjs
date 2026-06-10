import fs from "node:fs";
import path from "node:path";

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p);
  }
})("src");

const all = files.map((f) => ({ f: f.replace(/\\/g, "/"), src: fs.readFileSync(f, "utf8") }));
const skip = /src\/(components\/ui|routeTree)/;

for (const { f, src } of all) {
  if (skip.test(f)) continue;
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|class|type|interface)\s+([A-Za-z0-9_]+)/g))
    names.add(m[1]);
  for (const n of names) {
    if (n === "Route") continue; // file-route convention
    const used = all.some((o) => o.f !== f && new RegExp("\\b" + n + "\\b").test(o.src));
    if (!used) console.log(`${f}: ${n}`);
  }
}
