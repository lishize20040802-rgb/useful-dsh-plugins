// Deterministic, synthetic documents. No sibling plugin or user document needed.
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'

const fixtures = fileURLToPath(new URL('../test/fixtures/', import.meta.url))
await mkdir(fixtures, { recursive: true })
const save = (name, data) => writeFile(new URL(`../test/fixtures/${name}`, import.meta.url), data)

// A one-page PDF with a real cross-reference table and synthetic test text.
const pageText = 'BT /F1 24 Tf 72 720 Td (Synthetic document fixture) Tj 0 -40 Td (No personal data.) Tj ET\n'
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${Buffer.byteLength(pageText)} >>\nstream\n${pageText}endstream`,
]
let pdf = '%PDF-1.4\n'
const offsets = [0]
objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
const xref = Buffer.byteLength(pdf)
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
await save('demo.pdf', pdf)

// Stored ZIP entries are sufficient for a minimal DOCX. Fixed headers avoid
// machine paths, authors, timestamps or other office-document metadata.
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function zip(files) {
  const local = [], central = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const filename = Buffer.from(name), bytes = Buffer.from(content), crc = crc32(bytes)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4)
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(filename.length, 26)
    const record = Buffer.alloc(46)
    record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6)
    record.writeUInt32LE(crc, 16); record.writeUInt32LE(bytes.length, 20); record.writeUInt32LE(bytes.length, 24); record.writeUInt16LE(filename.length, 28); record.writeUInt32LE(offset, 42)
    local.push(header, filename, bytes); central.push(record, filename)
    offset += header.length + filename.length + bytes.length
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10)
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, directory, end])
}
await save('demo.docx', zip({
  '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/document.xml': '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + ['第一段：极限的定义。', '第二段：泰勒公式展开。', '第三段：洛必达法则适用条件。'].map(text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join('') + '</w:body></w:document>',
}))
const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['item', 'value'], ['alpha', 1], ['beta', 2]]), 'Synthetic')
await save('demo.xlsx', XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
await save('note.md', '# Synthetic fixture\n\nPublic test content.\n')
console.log('Synthetic PDF, DOCX, XLSX and Markdown fixtures generated.')
