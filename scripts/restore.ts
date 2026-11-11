import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { fail } from './brief'
import { restoreSources, roundDir, sourceDiff } from './rounds'

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: { force: { type: 'boolean', default: false } },
  allowPositionals: true,
})
const [name, roundArg] = positionals
const round = Number(roundArg?.replace(/^r/, ''))
if (!name || !Number.isInteger(round) || round < 1) fail('usage: bun run restore <scene> <round> [--force]')

const dir = join('scenes', name)
const historyPath = join(dir, 'scores.json')
const history: { total: number }[] = existsSync(historyPath) ? await Bun.file(historyPath).json() : []
const target = roundDir(dir, round)
if (!existsSync(target)) fail(`${target} not found: round ${round} has no saved files`)

if (!values.force) {
  const latest = roundDir(dir, history.length)
  const unsaved = existsSync(latest) ? sourceDiff(dir, latest) : ['(no snapshot of the latest round to compare against)']
  if (unsaved.length) {
    fail(`${dir} has changes since round ${history.length} was scored:\n  ${unsaved.join('\n  ')}\nThey would be lost. Rerun with --force to discard them.`)
  }
}

restoreSources(dir, target)
const total = history[round - 1]?.total
console.log(`restored ${dir} to round ${round}${total === undefined ? '' : ` (scored ${total.toFixed(1)})`}`)
console.log('brief.md, refs/ and assets/ were left as they are. The next scored round records the restored state.')
