// End-to-end smoke test: drives the built app with a fake Resend API.
// Usage: npx electron-vite build && node tests/e2e/smoke.mjs [screenshotDir]
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const shots = resolve(process.argv[2] ?? join(tmpdir(), 'bulk-mailer-shots'))
mkdirSync(shots, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'bm-e2e-'))
const sample = resolve('sample/recipients.xlsx')
const exportPath = join(userData, 'report.csv')

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
const step = (m) => console.log('•', m)

// Fake Resend + native dialogs inside the main process.
await app.evaluate(({ dialog }, { sample, exportPath }) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [sample] })
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath })
  let n = 0
  globalThis.__sent = []
  globalThis.fetch = async (url, init) => {
    const u = String(url)
    const json = (status, body, headers = {}) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
    if (u.endsWith('/domains')) return json(200, { data: [{ name: 'mail.example.com', status: 'verified' }] })
    if (u.endsWith('/emails/batch')) {
      const emails = JSON.parse(init.body)
      globalThis.__sent.push({ key: init.headers['Idempotency-Key'], emails })
      if (n++ === 0) return json(429, { name: 'rate_limit_exceeded', message: 'Too many requests' }, { 'retry-after': '1' })
      return json(200, { data: emails.map((_, i) => ({ id: `fake-${n}-${i}` })) }, { 'ratelimit-remaining': '4' })
    }
    if (u.endsWith('/emails')) return json(200, { id: 'fake-test-1' })
    return json(404, { name: 'not_found', message: 'no' })
  }
}, { sample, exportPath })

const page = await app.firstWindow()
await page.setViewportSize({ width: 1280, height: 820 })
page.on('pageerror', (e) => console.error('PAGE ERROR', e))
page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()))
// Hide toasts so screenshots stay clean.
const shot = async (name) => {
  const style = await page.addStyleTag({ content: '[data-sonner-toaster]{display:none!important}' })
  await page.screenshot({ path: join(shots, `${name}.png`) })
  await style.evaluate((el) => el.remove())
}

// 1. First-run account
await page.getByText('Create your account').waitFor()
await shot('01-setup')
await page.getByLabel('Username').fill('mihir')
await page.getByLabel('Password', { exact: true }).fill('supersecret1')
await page.getByLabel('Confirm password').fill('supersecret1')
await page.getByRole('button', { name: 'Show password' }).first().click()
if ((await page.getByLabel('Password', { exact: true }).getAttribute('type')) !== 'text') throw new Error('show password failed')
await page.getByText('mihirdas.io').waitFor()
await shot('01-setup-visible-password')
step('password toggle + credit OK')
await page.getByRole('button', { name: 'Create account' }).click()
step('account created')

// 2. IPC guard: logout, then a protected call must be rejected
await page.getByText('Resend connection', { exact: true }).waitFor()
const before = await page.evaluate(() => window.api.auth.logout())
const blocked = await page.evaluate(() => window.api.resend.getConfig())
if (blocked.ok || blocked.code !== 'UNAUTHORIZED') throw new Error('IPC guard failed: ' + JSON.stringify(blocked))
step(`IPC guard OK (${blocked.code})`)
void before
await page.reload()
await page.getByText('Enter your local account password.').waitFor()
await page.getByLabel('Password', { exact: true }).fill('wrongpass1')
await page.getByRole('button', { name: 'Log in' }).click()
await page.getByText(/attempt\(s\) left/).first().waitFor()
await page.getByLabel('Password', { exact: true }).fill('supersecret1')
await page.getByRole('button', { name: 'Log in' }).click()
step('login OK after one wrong attempt')

// 3. Settings
await page.goto(page.url().replace(/#.*/, '#/settings'))
await page.getByText('Resend connection', { exact: true }).waitFor()
await page.getByLabel('API key').fill('re_test_1234567890')
await page.getByLabel('From name').fill('Plexora Lab')
await page.getByLabel('From email').fill('hello@mail.example.com')
await page.getByRole('button', { name: 'Save' }).click()
await page.getByText('Settings saved').waitFor()
await page.getByRole('button', { name: 'Test connection' }).click()
await page.getByText('Ready to send').waitFor()
await shot('02-settings')
const cfg = await page.evaluate(() => window.api.resend.getConfig())
if (JSON.stringify(cfg).includes('re_test_1234567890')) throw new Error('API key leaked to renderer')
step(`settings verified, key masked as ${cfg.data.apiKeyMasked}`)

// 4. Import
await page.getByRole('link', { name: /Import/ }).click()
await page.getByRole('button', { name: 'Choose file' }).click()
await page.getByText('recipients.xlsx', { exact: true }).waitFor()
await shot('03-import')
step('imported sample')

// 5. Compose
await page.getByRole('button', { name: /Compose/ }).click()
await page.getByLabel('Subject').fill('Hello {{name}} from {{company}}')
await page.waitForTimeout(300)
await shot('04-compose')

// 6. Review + test email
await page.getByRole('button', { name: /Review/ }).click()
await page.getByRole('button', { name: 'Send test email' }).click()
await page.getByText(/Test email sent/).waitFor()
await shot('05-review')
await page.getByRole('button', { name: 'Start sending' }).click()
await page.getByRole('button', { name: /Send \d+ emails/ }).click()
step('campaign started')

// 7. Send progress
await page.getByText('Live log').waitFor()
await page.getByText('Completed').first().waitFor({ timeout: 20_000 })
await shot('06-send')
const sent = await app.evaluate(() => globalThis.__sent)
const keys = sent.map((s) => s.key)
if (keys[0] !== keys[1]) throw new Error('retry did not reuse Idempotency-Key')
const first = sent[1].emails[0]
if (!first.subject.includes('Hello Rahim Uddin from Plexora Lab') || !first.text) throw new Error('bad email ' + JSON.stringify(first))
step(`sent: ${sent.length} requests, retry kept key ${keys[0]}`)

// 8. Report + export
await page.getByRole('button', { name: 'Report' }).click()
await page.getByText('Resend ID').waitFor()
await shot('07-report')
await page.getByRole('button', { name: /Export/ }).click()
await page.getByRole('menuitem', { name: 'CSV (.csv)' }).first().click()
await page.getByText(/Saved/).waitFor()
if (!existsSync(exportPath)) throw new Error('export missing')
step('report exported')

// 9. History
await page.getByRole('link', { name: 'History' }).click()
await page.getByText('Completed').first().waitFor()
await shot('08-history')

await app.close()
console.log(`\nE2E PASSED. Screenshots: ${shots}`)
