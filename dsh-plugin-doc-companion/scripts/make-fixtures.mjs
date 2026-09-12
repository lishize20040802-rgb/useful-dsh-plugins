// dsh-plugin-doc-companion — fixture builder.
//
// Generates test/fixtures/demo.docx (a minimal valid OOXML document with
// three Chinese paragraphs) so extraction tests run against a real docx.
// The PDF/XLSX fixtures are shared from dsh-plugin-doc-reader's fixtures.
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
// jszip is not a dependency of this package; the builder runs from the
// harness workspace where dsh-plugin-doc-reader provides it.
import JSZip from '../../dsh-plugin-doc-reader/node_modules/jszip/lib/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, '..', 'test', 'fixtures')
const readerFixtures = join(here, '..', '..', 'dsh-plugin-doc-reader', 'test', 'fixtures')

await mkdir(fixtures, { recursive: true })

// Shared binary fixtures (pdf / xlsx) from the doc-reader plugin.
await copyFile(join(readerFixtures, 'demo.pdf'), join(fixtures, 'demo.pdf'))
await copyFile(join(readerFixtures, 'demo.xlsx'), join(fixtures, 'demo.xlsx'))
await copyFile(join(readerFixtures, 'note.md'), join(fixtures, 'note.md'))

// Minimal OOXML document with three paragraphs.
const zip = new JSZip()
zip.file('[Content_Types].xml',
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '</Types>')
zip.file('_rels/.rels',
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>')
zip.file('word/document.xml',
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
  '<w:p><w:r><w:t>第一段：极限的定义。</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t>第二段：泰勒公式展开。</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t>第三段：洛必达法则适用条件。</w:t></w:r></w:p>' +
  '</w:body></w:document>')

await writeFile(join(fixtures, 'demo.docx'), await zip.generateAsync({ type: 'nodebuffer' }))
console.log('fixtures ready in', fixtures)
