#!/usr/bin/env node
/**
 * Generate market/index.json for the DSH plugin market.
 *
 * Usage:
 *   node market/gen-index.mjs <repo-url> [commit]
 *
 * <repo-url>  canonical https repository URL, e.g. https://github.com/xypshot/dsh-screenshot
 * [commit]    release commit SHA (lowercase 40-hex); defaults to `git rev-parse HEAD`
 *
 * The output lists the current package.json version at the given commit with the
 * icon inlined as a base64 SVG data URL. Re-run after every release commit and
 * commit the refreshed index.json.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))

const repoUrl = process.argv[2]
if (!repoUrl || !/^https:\/\/[^\s]+$/.test(repoUrl) || /[?#]/.test(repoUrl)) {
  console.error('Usage: node market/gen-index.mjs <canonical https repo-url> [commit]')
  process.exit(1)
}

let commit = process.argv[3]
if (commit === undefined) {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: pkgRoot, encoding: 'utf8' }).trim()
}
if (!/^[0-9a-f]{40}$/.test(commit)) {
  console.error(`Not a full 40-hex commit: ${commit}`)
  process.exit(1)
}

const iconB64 = readFileSync(join(pkgRoot, 'icon.svg')).toString('base64')

const index = {
  format: 1,
  title: { en: 'DSH Plugins', zh: 'DSH 插件' },
  description: {
    en: 'Community plugins for DeepSeek Harness.',
    zh: 'DeepSeek Harness 社区插件索引。',
  },
  metadata: { categories: {}, labels: {}, sortKeys: {} },
  plugins: [
    {
      name: pkg.name,
      title: { en: 'Screenshot', zh: '截图' },
      description: {
        en: 'WeChat-style region screenshot below the composer: Alt+A, cross-monitor overlay, straight to the clipboard.',
        zh: '对话框下方的微信式区域截图：Alt+A 快捷键、跨屏遮罩框选，截图直入剪贴板。',
      },
      icon: `data:image/svg+xml;base64,${iconB64}`,
      author: 'xypshot',
      homepage: repoUrl,
      repository: { url: repoUrl },
      metadata: {
        keywords: ['screenshot', '截图', 'clipboard', '剪贴板', 'multi-monitor', '跨屏', 'snip'],
        labels: [],
        sortKeys: {},
      },
      versions: [
        {
          version: pkg.version,
          publishTimestamp: Math.floor(Date.now() / 1000),
          source: { type: 'git', url: repoUrl, commit },
          engines: { dsh: '>=0.2.0' },
        },
      ],
    },
  ],
}

const out = join(pkgRoot, 'market', 'index.json')
writeFileSync(out, JSON.stringify(index, null, 2) + '\n', 'utf8')
console.log(`wrote ${out}`)
console.log(`  version ${pkg.version} @ ${commit.slice(0, 12)} (${repoUrl})`)
