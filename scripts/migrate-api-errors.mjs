/**
 * One-off: replace console.error + generic 500 catch blocks with apiInternalError.
 * Re-runs safely on files that already import apiInternalError.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (p.includes(`${path.sep}api${path.sep}`) && p.endsWith(".ts")) out.push(p)
  }
  return out
}

function eventName(file) {
  const rel = path.relative(root, file).replace(/\\/g, "/").replace(/\.ts$/, "")
  return rel
    .replace(/^app\/api\//, "app.")
    .replace(/^modules\//, "")
    .replace(/\//g, ".")
    .replace(/\[(\w+)\]/g, "$1")
}

const importLine = 'import { apiInternalError } from "@/shared/api-errors"\n'

let changed = 0
for (const file of [...walk(path.join(root, "modules")), ...walk(path.join(root, "app", "api"))]) {
  let src = fs.readFileSync(file, "utf8")
  if (!src.includes("console.error")) continue

  const orig = src
  src = src.replace(/\r\n/g, "\n")
  if (!src.includes(importLine.trim())) {
    const m = src.match(/^import .+$/m)
    if (m) {
      const idx = src.indexOf(m[0]) + m[0].length + 1
      src = src.slice(0, idx) + importLine + src.slice(idx)
    } else {
      src = importLine + src
    }
  }

  const ev = eventName(file)
  const logArg = '(?:\\[[^\\]]+\\]|"[^"]+")'
  src = src.replace(
    new RegExp(`catch \\(err\\) \\{\\s*\\n\\s*console\\.error\\(${logArg},\\s*err\\)\\s*\\n\\s*return NextResponse\\.json\\(\\{ error: "Internal server error"(?:, detail: errorMessage\\(err\\))?\\s*\\}, \\{ status: 500 \\}\\)\\s*\\n\\s*\\}`, "g"),
    `catch (err) {\n    return apiInternalError("${ev}", err)\n  }`,
  )
  src = src.replace(
    new RegExp(`catch \\(err\\) \\{\\s*\\n\\s*console\\.error\\(${logArg},\\s*err\\)\\s*\\n\\s*return NextResponse\\.json\\(\\{ error: "[^"]+" \\}, \\{ status: 500 \\}\\)\\s*\\n\\s*\\}`, "g"),
    `catch (err) {\n    return apiInternalError("${ev}", err)\n  }`,
  )
  src = src.replace(
    new RegExp(`catch \\(err\\) \\{\\s*\\n\\s*console\\.error\\(${logArg},\\s*err\\)\\s*\\n\\s*return NextResponse\\.json\\(\\s*\\n\\s*\\{ error: "[^"]+", detail: errorMessage\\(err\\) \\},\\s*\\n\\s*\\{ status: 500 \\},\\s*\\n\\s*\\)\\s*\\n\\s*\\}`, "g"),
    `catch (err) {\n    return apiInternalError("${ev}", err, undefined, { exposeDetail: true })\n  }`,
  )
  src = src.replace(
    /catch \{\s*\n\s*return NextResponse\.json\(\{ error: "Internal server error" \}, \{ status: 500 \}\)\s*\n\s*\}/g,
    `catch (err) {\n    return apiInternalError("${ev}", err)\n  }`,
  )

  if (src !== orig.replace(/\r\n/g, "\n")) {
    fs.writeFileSync(file, src.replace(/\n/g, "\r\n"))
    changed++
    console.log("updated", path.relative(root, file))
  }
}
console.log("done,", changed, "files")
