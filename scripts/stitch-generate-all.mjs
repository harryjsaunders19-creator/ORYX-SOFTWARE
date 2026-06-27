#!/usr/bin/env node
/** Generate all missing Oryx pages in Stitch. Reads key from ~/.cursor/mcp.json */
import { readFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"

const PROJECT_ID = "9285907226401655297"
const DESIGN_SYSTEM = "assets/9da4dc19efb1427085293c51846939e4"

const mcp = JSON.parse(readFileSync(join(homedir(), ".cursor", "mcp.json"), "utf8"))
const key = mcp.mcpServers?.stitch?.env?.STITCH_API_KEY ?? mcp.mcpServers?.stitch?.headers?.["X-Goog-Api-Key"]
if (!key) { console.error("No Stitch API key"); process.exit(1) }

const PAGES = [
  ["Clients List", "Clients directory page. Dark sidebar Clients active. Search bar, New Client button. Table: Company, Contact, Email, Phone, Active Jobs count, Added date. Bristol scaffold clients. Hold badge on some rows."],
  ["Set Password", "Set new password page. No sidebar. Centred card, Oryx logo. New password + confirm fields. Force password change flow for internal app."],
  ["Jobs Import", "Admin jobs import page. Dark sidebar Jobs active. CSV/XLSX upload dropzone, preview table of parsed rows, column mapping hints, Import button. Scaffold job fields: drawing number, client, address, works type."],
  ["Clients Import", "Admin clients import page. Upload spreadsheet, preview table, commit import button. Match Oryx design system."],
  ["Hold List", "Clients on hold page. Dark sidebar Hold List active. Table: Client name, reason, date placed on hold, placed by. Red/warning accents for blocked clients."],
  ["Users Admin", "Admin user management. Dark sidebar Users active. Table: Name, Email, Role badge Admin/Engineer, Active status, Last updated. Add User button."],
  ["System Backup", "Admin backup page. Dark sidebar System Backup active. Backup jobs table: status, trigger, rows, size, created. Run Backup button. Audit log section below."],
  ["System Health", "Admin health dashboard. Dark sidebar System Health active. Cards: DB connection OK, job count, sequence status, read/write test. Green/red status indicators."],
]

async function call(tool, args) {
  const res = await fetch("https://stitch.googleapis.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }),
  })
  return res.json()
}

for (const [title, prompt] of PAGES) {
  process.stdout.write(`Generating ${title}… `)
  const result = await call("generate_screen_from_text", {
    projectId: PROJECT_ID,
    designSystem: DESIGN_SYSTEM,
    deviceType: "DESKTOP",
    prompt: `${prompt} Oryx Design Ltd scaffold consultancy internal B2B tool. Ink indigo #4640DE accent, dark sidebar #1C1C1E, Inter + JetBrains Mono.`,
  })
  const text = result.result?.content?.[0]?.text ?? ""
  if (result.result?.isError) {
    console.log("FAILED:", text.slice(0, 120))
  } else {
    const parsed = JSON.parse(text)
    const screen = parsed.outputComponents?.[0]?.design?.screens?.[0]
    console.log("OK →", screen?.title ?? title)
  }
}
