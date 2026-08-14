// dsh-plugin-doc-reader — cordis plugin contract.
//
// Registers the model-facing `read_document` tool. The tool reads text, PDF,
// DOCX and XLSX files through the harness filesystem backend (`ctx.fs`), so it
// inherits the session workspace resolution, the sandbox policy and the
// fs-observation policy exactly like the built-in `read` tool.
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { FsError } from '@deepseek-ai/dsh-fs'
import {
  detectFormat,
  parseDocument,
  renderEnvelope,
  windowLines,
  SUPPORTED_FORMATS
} from './doc-read.js'

/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export const name = 'tool-doc-reader'

/** Services required by this plugin. */
export const inject = ['tools', 'fs', 'systemPrompt']

/** Default and maximum number of lines returned by one call. */
const READ_LIMIT = 2000
/** Default byte cap for one document read. */
const MAX_FILE_BYTES = 64 * 1024 * 1024
/** Default rows kept per worksheet. */
const SHEET_ROW_LIMIT = 200

export const Config = z.object({
  readLimit: z.number().default(READ_LIMIT),
  maxFileBytes: z.number().default(MAX_FILE_BYTES),
  sheetRowLimit: z.number().default(SHEET_ROW_LIMIT)
})

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`)
}

function parseArgs(args, config) {
  if (typeof args.file_path !== 'string' || args.file_path.trim() === '') {
    throw new Error('file_path must be a non-empty string')
  }
  const offset = args.offset === undefined ? 1 : args.offset
  if (!Number.isInteger(offset) || offset < 1) throw new Error('offset must be a positive integer')
  const limit = args.limit === undefined ? config.readLimit : args.limit
  if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer')
  if (limit > config.readLimit) throw new Error(`limit must be less than or equal to ${config.readLimit}`)
  const format = args.format ?? 'auto'
  if (format !== 'auto' && !SUPPORTED_FORMATS.has(format)) {
    throw new Error(`unsupported format "${format}" (expected auto, text, pdf, docx or xlsx)`)
  }
  return { filePath: args.file_path, offset, limit, format }
}

/** The session workspace cwd for this call, when one applies. */
function sessionCwd(exec) {
  return exec.agent?.session.header.cwd
}

export function apply(ctx, config) {
  assertPositiveInteger(config.readLimit, 'readLimit')
  assertPositiveInteger(config.maxFileBytes, 'maxFileBytes')
  assertPositiveInteger(config.sheetRowLimit, 'sheetRowLimit')

  ctx.systemPrompt.section({
    name: 'tool:read-document',
    order: 110,
    text: 'Use the read_document tool to read PDF, DOCX and XLSX documents that the plain read tool cannot handle; it also reads plain text files. Use offset and limit to page through long documents.'
  })

  // A tool-name conflict (another plugin registered `read_document` first)
  // must never crash the host composition: degrade to "tool unavailable"
  // with a loud, diagnosable warning instead.
  try {
    registerTool(ctx, config)
  } catch (err) {
    console.error('[dsh-plugin-doc-reader] read_document tool registration failed (name conflict with another plugin?); the tool will be unavailable:', err)
  }
}

function registerTool(ctx, config) {
  ctx.tools.register(defineTool({
    name: 'read_document',
    description: 'Read a document file (text, PDF, DOCX or XLSX) and return its content as line-numbered pages.',
    parameters: {
      file_path: {
        type: 'string',
        required: true,
        description: 'Path to the document, resolved by the filesystem backend.'
      },
      format: {
        type: 'string',
        enum: ['auto', 'text', 'pdf', 'docx', 'xlsx'],
        description: 'Optional format override. Defaults to auto-detection from the file extension.'
      },
      offset: {
        type: 'number',
        description: '1-based first line to return. Defaults to 1.'
      },
      limit: {
        type: 'number',
        description: `Maximum number of lines to return. Defaults to ${config.readLimit}.`
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          format: { type: 'string', required: true, enum: ['text', 'pdf', 'docx', 'xlsx'] },
          offset: { type: 'integer', required: true },
          lines: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                number: { type: 'integer', required: true },
                text: { type: 'string', required: true }
              }
            }
          },
          totalLines: { type: 'integer', required: true }
        }
      },
      render: (_args, value) => [{
        type: 'text',
        text: renderEnvelope(value.path, 'document', value)
      }]
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const input = parseArgs(args, config)
      const cwd = sessionCwd(exec)
      const target = await ctx.fs.resolve(input.filePath, {
        ...(cwd !== undefined ? { cwd } : {}),
        signal: exec.signal
      })
      const info = await ctx.fs.stat(target, exec.signal)
      if (info === undefined) {
        ctx.emit('fs/observed', target, { kind: 'absent' }, exec)
        throw new FsError(`cannot read "${target.displayPath}": not found`, 'FS_NOT_FOUND')
      }
      if (info.type !== 'file') {
        throw new FsError(`cannot read "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
      }
      const bytes = await ctx.fs.readBytes(target, exec.signal, config.maxFileBytes)
      const resolvedFormat = input.format === 'auto' ? detectFormat(target.displayPath) : input.format
      const text = await parseDocument(bytes, resolvedFormat, { sheetRowLimit: config.sheetRowLimit })
      const window = windowLines(text, input.offset, input.limit)
      ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)
      return {
        path: target.displayPath,
        format: resolvedFormat,
        offset: input.offset,
        lines: window.lines,
        totalLines: window.totalLines
      }
    },
    presentCall(args) {
      return {
        card: 'generic',
        title: `Read document ${args.file_path}`,
        kind: 'read',
        locations: [{ path: args.file_path }]
      }
    }
  }))
}
