#!/usr/bin/env node
/**
 * One-off helper to call Stitch MCP tools from the CLI.
 * Key resolution (first match wins):
 *   1. STITCH_API_KEY env var
 *   2. ~/.cursor/mcp.json
 */
import { readFileSync, existsSync } from "fs"
import { homedir } from "os"
import { join } from "path"

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
  if (!existsSync(mcpPath)) return null
  const mcp = JSON.parse(readFileSync(mcpPath, "utf8"))
  const stitch = mcp.mcpServers?.stitch
  return stitch?.headers?.["X-Goog-Api-Key"] ?? stitch?.env?.STITCH_API_KEY ?? null
}

const key = readKey()

if (!key) {
  console.error("No Stitch API key found in ~/.cursor/mcp.json")
  process.exit(1)
}

const [mode, toolName, argsJson = "{}"] = process.argv.slice(2)
if (!mode) {
  console.error("Usage: node scripts/stitch-call.mjs <tools/list|tools/call> [toolName] [jsonArgs]")
  process.exit(1)
}

if (mode === "tools/list") {
  const res = await fetch("https://stitch.googleapis.com/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  })
  const text = await res.text()
  console.log(`HTTP ${res.status}`)
  try {
    const parsed = JSON.parse(text)
    const tools = parsed.result?.tools ?? []
    console.log(`Tools (${tools.length}):`)
    for (const t of tools) {
      console.log(`- ${t.name}`)
      if (t.inputSchema) console.log(JSON.stringify(t.inputSchema, null, 2))
    }
  } catch {
    console.log(text.slice(0, 8000))
  }
  process.exit(0)
}

if (!toolName) {
  console.error("Usage: node scripts/stitch-call.mjs tools/call <toolName> [jsonArgs]")
  process.exit(1)
}

const args = JSON.parse(argsJson)

const res = await fetch("https://stitch.googleapis.com/mcp", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": key,
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  }),
})

const text = await res.text()
console.log(`HTTP ${res.status}`)
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2))
} catch {
  console.log(text)
}
