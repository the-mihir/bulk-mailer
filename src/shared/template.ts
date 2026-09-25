/** Placeholder syntax: {{ name }} — keys are case-insensitive, spaces become underscores. */
const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g

export function normalizeKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface TemplateVars {
  name: string
  email: string
  fields: Record<string, string>
}

function lookup(vars: TemplateVars, key: string, nameFallback: string): string {
  const k = normalizeKey(key)
  if (k === 'name') return vars.name.trim() || nameFallback
  if (k === 'email') return vars.email
  return vars.fields[k] ?? ''
}

export function renderText(template: string, vars: TemplateVars, nameFallback: string): string {
  return template.replace(PLACEHOLDER, (_, key: string) => lookup(vars, key, nameFallback))
}

export function renderHtml(template: string, vars: TemplateVars, nameFallback: string): string {
  return template.replace(PLACEHOLDER, (_, key: string) => escapeHtml(lookup(vars, key, nameFallback)))
}

/** Subjects are a single header line: strip CR/LF so data cannot inject headers. */
export function renderSubject(template: string, vars: TemplateVars, nameFallback: string): string {
  return renderText(template, vars, nameFallback).replace(/[\r\n]+/g, ' ').trim()
}

export function placeholdersIn(template: string): string[] {
  const out = new Set<string>()
  for (const m of template.matchAll(PLACEHOLDER)) out.add(normalizeKey(m[1]))
  return [...out]
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }

/** Plain-text alternative for the HTML body. Improves spam score and accessibility. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, '').trim()
      return text && text !== href ? `${text} (${href})` : href
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|tr|li|ul|ol|table|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e])
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
