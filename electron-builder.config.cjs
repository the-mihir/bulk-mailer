/**
 * electron-builder config.
 *
 * macOS signing is picked from the environment:
 *  - No certificate:            ad-hoc signed ("-"). Runs on any Mac, but Gatekeeper
 *                               asks the user to approve it once.
 *  - CSC_NAME or CSC_LINK set:  signed with your "Developer ID Application" certificate.
 *  - plus APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID:
 *                               notarized by Apple, so it opens with no warning.
 */
// CI passes unset secrets as empty strings; electron-builder would treat "" as a path.
for (const key of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'CSC_NAME', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) {
  if (process.env[key] === '') delete process.env[key]
}

const hasCert = Boolean(process.env.CSC_NAME || process.env.CSC_LINK)
const canNotarize = hasCert && Boolean(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID)

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.plexoralab.bulkmailer',
  productName: 'Bulk Mailer',
  copyright: 'Copyright © 2026 Mihir Das · mihirdas.io',
  directories: { buildResources: 'build', output: 'dist' },
  // Releases are uploaded by hand or by CI, never implicitly from a tag build.
  publish: null,
  files: ['out/**', 'resources/**', 'package.json', '!**/*.map'],
  asar: true,
  compression: 'maximum',

  mac: {
    category: 'public.app-category.productivity',
    icon: 'build/icon.png',
    // One download for every Mac: Apple Silicon (M1–M4) and Intel.
    target: [
      { target: 'dmg', arch: ['universal'] },
      { target: 'zip', arch: ['universal'] }
    ],
    minimumSystemVersion: '12.0',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    identity: hasCert ? undefined : '-',
    notarize: canNotarize,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    artifactName: 'BulkMailer-${version}-mac-${arch}.${ext}'
  },
  dmg: {
    title: 'Bulk Mailer ${version}',
    artifactName: 'BulkMailer-${version}-mac-${arch}.${ext}',
    window: { width: 540, height: 380 },
    contents: [
      { x: 140, y: 190, type: 'file' },
      { x: 400, y: 190, type: 'link', path: '/Applications' }
    ]
  },

  win: {
    icon: 'build/icon.png',
    target: [
      { target: 'nsis', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] }
    ],
    artifactName: 'BulkMailer-${version}-win-${arch}.${ext}'
  },
  nsis: {
    artifactName: 'BulkMailer-${version}-win-${arch}-setup.${ext}',
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Bulk Mailer',
    deleteAppDataOnUninstall: false
  },

  linux: { target: ['AppImage'], category: 'Office', icon: 'build/icon.png' }
}
