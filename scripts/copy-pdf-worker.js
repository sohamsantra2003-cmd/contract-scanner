const fs = require('fs')
const path = require('path')

const possiblePaths = [
  path.join(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
]

// Search pnpm virtual store for pdfjs-dist
const pnpmStorePath = path.join(process.cwd(), 'node_modules/.pnpm')
if (fs.existsSync(pnpmStorePath)) {
  const entries = fs.readdirSync(pnpmStorePath)
  const pdfEntry = entries.find(e => e.startsWith('pdfjs-dist@'))
  if (pdfEntry) {
    possiblePaths.unshift(path.join(
      pnpmStorePath, pdfEntry,
      'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'
    ))
  }
}

const destPath = path.join(process.cwd(), 'public/pdf.worker.min.mjs')

// Skip if already present (e.g. tracked in git)
if (fs.existsSync(destPath)) {
  console.log('✓ PDF worker already present at public/pdf.worker.min.mjs')
  process.exit(0)
}

let copied = false
for (const srcPath of possiblePaths) {
  if (fs.existsSync(srcPath)) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.copyFileSync(srcPath, destPath)
    console.log('✓ PDF worker copied:\n  ' + srcPath + '\n  → ' + destPath)
    copied = true
    break
  }
}

if (!copied) {
  console.warn(
    '⚠ Could not find pdfjs-dist worker file.\n' +
    '  PDF viewer may not work. Try:\n' +
    '  pnpm add pdfjs-dist'
  )
}
