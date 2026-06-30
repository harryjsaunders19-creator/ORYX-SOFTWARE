#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { homedir } from "os"
import { join } from "path"

const PROJECT_ID = "9285907226401655297"
const OUT = join(process.cwd(), "stitch-export")

function readKey() {
  if (process.env.STITCH_API_KEY?.trim()) return process.env.STITCH_API_KEY.trim()
  const localEnv = join(process.cwd(), ".env.stitch.local")
  if (existsSync(localEnv)) {
    for (const line of readFileSync(localEnv, "utf8").split(/\r?\n/)) {
      const m = line.match(/^STITCH_API_KEY=(.+)$/)
      if (m) return m[1].trim()
    }
  }
  const mcpPath = join(homedir(), ".cursor", "mcp.json")
  if (existsSync(mcpPath)) {
    const mcp = JSON.parse(readFileSync(mcpPath, "utf8"))
    const stitch = mcp.mcpServers?.stitch
    return stitch?.headers?.["X-Goog-Api-Key"] ?? stitch?.env?.STITCH_API_KEY ?? null
  }
  return null
}

async function call(tool, args) {
  const key = readKey()
  if (!key) throw new Error("No STITCH_API_KEY")
  const res = await fetch("https://stitch.googleapis.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }),
  })
  const json = await res.json()
  if (json.result?.isError) throw new Error(json.result.content?.[0]?.text ?? "Stitch error")
  const text = json.result?.content?.[0]?.text
  return text ? JSON.parse(text) : json.result
}

const screenId = process.argv[2] ?? "57a4ef91b1eb4875848cae639b7a1778"
const name = `projects/${PROJECT_ID}/screens/${screenId}`

const screen = await call("get_screen", { name, projectId: PROJECT_ID, screenId })
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, `${screenId}.json`), JSON.stringify(screen, null, 2))

const html = screen.htmlCode?.html ?? screen.htmlCode ?? screen.html
if (typeof html === "string") {
  writeFileSync(join(OUT, `${screenId}.html`), html)
  console.log(`Wrote HTML (${html.length} chars)`)
} else {
  console.log("Keys:", Object.keys(screen))
  if (screen.htmlCode) console.log("htmlCode keys:", Object.keys(screen.htmlCode))
}

console.log(`Title: ${screen.title}`)
console.log(`Saved stitch-export/${screenId}.json`)
