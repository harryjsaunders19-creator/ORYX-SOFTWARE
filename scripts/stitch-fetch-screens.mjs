#!/usr/bin/env node
/** Fetch screen list + HTML export for Oryx Stitch project. */
import { readFileSync, writeFileSync, existsSync } from "fs"
import { homedir } from "os"
import { join } from "path"

const PROJECT_ID = "9285907226401655297"

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

const list = await call("list_screens", { projectId: PROJECT_ID })
const screens = list.screens ?? []
writeFileSync("stitch-screens-list.json", JSON.stringify(screens.map(s => ({
  id: s.name?.split("/").pop(),
  title: s.title,
  width: s.width,
  height: s.height,
})), null, 2))

console.log(`Screens (${screens.length}):`)
for (const s of screens) {
  const id = s.name?.split("/").pop()
  console.log(`- ${s.title ?? "(untitled)"} [${id}]`)
}
