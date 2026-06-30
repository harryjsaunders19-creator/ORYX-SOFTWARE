#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "fs"
import { join } from "path"

const ids = process.argv.slice(2)
if (!ids.length) {
  console.error("Usage: node scripts/stitch-download-html.mjs <screenId>...")
  process.exit(1)
}

for (const id of ids) {
  const jsonPath = join(process.cwd(), "stitch-export", `${id}.json`)
  if (!existsSync(jsonPath)) {
    console.error("Missing", jsonPath)
    continue
  }
  const screen = JSON.parse(readFileSync(jsonPath, "utf8"))
  const url = screen.htmlCode?.downloadUrl
  if (!url) {
    console.error("No downloadUrl for", id)
    continue
  }
  const html = await fetch(url).then(r => r.text())
  writeFileSync(join(process.cwd(), "stitch-export", `${id}.html`), html)
  console.log(id, html.length, "bytes")
}
