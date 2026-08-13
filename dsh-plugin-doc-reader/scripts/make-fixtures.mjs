// Generate smoke-test fixtures: demo.xlsx (via xlsx lib) and demo.pdf
// (hand-built minimal PDF with exact xref offsets).
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

const dir = fileURLToPath(new URL('../test/fixtures', import.meta.url))

// --- demo.xlsx ---
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([
    ['ticker', 'date', 'close'],
    ['000001', '2026-01-02', 10.5],
    ['000002', '2026-01-03', 20.1]
  ]),
  'quotes'
)
writeFileSync(`${dir}/demo.xlsx`, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))

// --- demo.pdf ---
const streamText = 'BT /F1 24 Tf 72 720 Td (Hello from D: harness smoke PDF) Tj ET'
const objs = [
  '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
  '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
  '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
  `4 0 obj\n<< /Length ${Buffer.byteLength(streamText)} >>\nstream\n${streamText}\nendstream\nendobj\n`,
  '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
]
let buf = Buffer.from('%PDF-1.4\n')
const offsets = []
for (const obj of objs) {
  offsets.push(buf.length)
  buf = Buffer.concat([buf, Buffer.from(obj)])
}
const xrefPos = buf.length
let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`
xref += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`
writeFileSync(`${dir}/demo.pdf`, Buffer.concat([buf, Buffer.from(xref)]))

console.log('fixtures written:', `${dir}/demo.xlsx`, `${dir}/demo.pdf`)
