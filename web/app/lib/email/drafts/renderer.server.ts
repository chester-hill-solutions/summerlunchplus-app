import type { RenderDraftInput, RenderDraftOutput } from '@/lib/email/drafts/types'

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g

const readVariable = (key: string, variables: Record<string, unknown>) => {
  const parts = key.split('.')
  let current: unknown = variables

  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

const interpolate = (input: string, variables: Record<string, unknown>) => {
  const missing = new Set<string>()

  const output = input.replaceAll(PLACEHOLDER_RE, (_match, key: string) => {
    const resolved = readVariable(key, variables)
    if (resolved === null || resolved === undefined || resolved === '') {
      missing.add(key)
      return `{{${key}}}`
    }
    return String(resolved)
  })

  return { output, missingVariables: Array.from(missing).sort() }
}

const renderInlineMarkdown = (line: string) => {
  const escaped = escapeHtml(line)
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

const markdownToHtml = (markdown: string) => {
  const normalized = markdown.replace(/\r\n/g, '\n').trim()
  if (!normalized) return '<p></p>'

  const lines = normalized.split('\n')
  const html: string[] = []
  let inList = false

  const closeList = () => {
    if (inList) {
      html.push('</ul>')
      inList = false
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line.trim()) {
      closeList()
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      closeList()
      const level = heading[1].length
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`)
      continue
    }

    const listItem = line.match(/^[-*]\s+(.*)$/)
    if (listItem) {
      if (!inList) {
        html.push('<ul>')
        inList = true
      }
      html.push(`<li>${renderInlineMarkdown(listItem[1])}</li>`)
      continue
    }

    closeList()
    html.push(`<p>${renderInlineMarkdown(line)}</p>`)
  }

  closeList()
  return html.join('\n')
}

const markdownToText = (markdown: string) => markdown.replace(/\r\n/g, '\n').trim()

export const renderEmailDraft = ({
  subjectMarkdown,
  bodyMarkdown,
  variables = {},
}: RenderDraftInput): RenderDraftOutput => {
  const subjectInterpolation = interpolate(subjectMarkdown, variables)
  const bodyInterpolation = interpolate(bodyMarkdown, variables)
  const missingVariables = Array.from(
    new Set([...subjectInterpolation.missingVariables, ...bodyInterpolation.missingVariables])
  ).sort()

  return {
    subject: subjectInterpolation.output,
    html: markdownToHtml(bodyInterpolation.output),
    text: markdownToText(bodyInterpolation.output),
    missingVariables,
  }
}

export const collectPlaceholders = (value: string) => {
  const keys = new Set<string>()
  let next = PLACEHOLDER_RE.exec(value)
  while (next) {
    keys.add(next[1])
    next = PLACEHOLDER_RE.exec(value)
  }
  PLACEHOLDER_RE.lastIndex = 0
  return Array.from(keys).sort()
}
