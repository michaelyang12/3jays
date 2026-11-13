import { cpSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fail, readBrief } from './brief'
import { REVIEW_FILE } from './shot'

const SKIP = new Set(['refs', 'shots', 'rounds', 'scores.json'])
const usage = 'usage: bun run fork <source-scene> <new-scene>'

const [source, name] = Bun.argv.slice(2)
if (!source || !name) fail(usage)
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) fail(`"${name}" must be kebab-case`)
const from = join('scenes', source)
const to = join('scenes', name)
if (!existsSync(join(from, 'scene.ts'))) fail(`${from}/scene.ts not found`)
if (existsSync(to)) fail(`${to} already exists; pick another name or remove it first`)

cpSync(from, to, {
  recursive: true,
  filter: (path) => {
    const top = relative(from, path).split(sep)[0]
    return !SKIP.has(top) && !REVIEW_FILE.test(top)
  },
})

const briefPath = join(to, 'brief.md')
if (existsSync(briefPath)) {
  const { meta, body } = await readBrief(briefPath)
  const title = name.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')
  const next = { title, source, refs: [], aspect: meta.aspect, type: meta.type, status: 'in-progress', score: null }
  const note = `\n> Forked from \`scenes/${source}\`, whose files are this scene's reference. Rewrite this brief for the redesign: the user's constraints, each layout, and its tradeoffs.\n`
  await Bun.write(briefPath, `---\n${Bun.YAML.stringify(next, null, 2).trimEnd()}\n---\n${note}${body}`)
}

console.log(`forked ${from} -> ${to} (skipped ${[...SKIP].join(', ')} and review files)`)
console.log(`next: make the items movable (skills/scene-redox/references/layout-system.md), then \`bun run shot ${name} --layout original --match ${source}\``)
