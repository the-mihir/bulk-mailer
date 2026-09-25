import { describe, expect, it } from 'vitest'
import { htmlToText, placeholdersIn, renderHtml, renderSubject } from '@shared/template'

const vars = { name: 'Rahim <b>Uddin</b>', email: 'r@example.com', fields: { company: 'Acme & Co' } }

describe('template', () => {
  it('escapes values in HTML', () => {
    expect(renderHtml('<p>Hi {{name}} from {{ Company }}</p>', vars, 'there')).toBe(
      '<p>Hi Rahim &lt;b&gt;Uddin&lt;/b&gt; from Acme &amp; Co</p>'
    )
  })

  it('uses the fallback for empty names', () => {
    expect(renderHtml('Hi {{name}}', { ...vars, name: '  ' }, 'there')).toBe('Hi there')
  })

  it('renders unknown placeholders as empty', () => {
    expect(renderHtml('[{{missing}}]', vars, 'there')).toBe('[]')
  })

  it('strips line breaks from subjects', () => {
    expect(renderSubject('Hi {{name}}', { ...vars, name: 'A\r\nBcc: x@y.z' }, 'there')).toBe('Hi A Bcc: x@y.z')
  })

  it('lists placeholders', () => {
    expect(placeholdersIn('{{Name}} {{first name}} {{name}}')).toEqual(['name', 'first_name'])
  })

  it('builds a plain-text version', () => {
    const text = htmlToText('<p>Hi &amp; welcome</p><p>Visit <a href="https://x.io">our site</a><br>Bye</p>')
    expect(text).toBe('Hi & welcome\nVisit our site (https://x.io)\nBye')
  })
})
