import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = process.argv[2] ?? path.join(__dirname, "../fixtures/oryx-stress-test-export.xlsx")

const { importFromExcelBuffer } = await import("../lib/excel-import.ts")
const buf = fs.readFileSync(file)
const t0 = Date.now()
const result = await importFromExcelBuffer(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
)
console.log(JSON.stringify(result, null, 2))
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s — file: ${file}`)
