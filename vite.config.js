import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// Offline app: after the build, writes dist/sw.js from src/serviceWorker.js with the list of
// every built file (so the phone saves them all) and a version that changes with the files.
function offlineApp() {
  return {
    name: 'offline-app',
    apply: 'build',
    writeBundle({ dir }) {
      const files = []
      const walk = (folder) => readdirSync(folder).forEach((name) => {
        const path = join(folder, name)
        if (statSync(path).isDirectory()) walk(path)
        else files.push(relative(dir, path).replaceAll('\\', '/'))
      })
      walk(dir)
      // The PDF reader (pdf.js, about 1.7 MB) is only for the admin's blueprint uploads: not saved offline.
      const precache = files.filter((file) => file !== 'sw.js' && file !== 'index.html' && !file.endsWith('.map') && !/^assets\/pdf(\.worker)?[.-]/.test(file))
      const version = createHash('sha256')
        .update(files.sort().join('\n'))
        .update(readFileSync(join(dir, 'index.html')))
        .digest('hex')
        .slice(0, 12)
      const worker = readFileSync('src/serviceWorker.js', 'utf8')
      writeFileSync(join(dir, 'sw.js'), `const PRECACHE = ${JSON.stringify(['./', ...precache])};\nconst VERSION = "${version}";\n${worker}`)
    },
  }
}

export default defineConfig({
  plugins: [react(), offlineApp()],
  base: './', // relative paths: the same build works on Vercel and in the GitHub Pages sub-folder
})
