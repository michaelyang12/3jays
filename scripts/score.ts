import { existsSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { fail, readBrief } from './brief'
import { pendingDir, roundDir } from './rounds'
import { freeze, REVIEW_FILE, type Freeze } from './shot'

export const CRITERIA = ['composition', 'subjects', 'lighting', 'color', 'materials', 'atmosphere'] as const
export type Criterion = (typeof CRITERIA)[number]
export type CriterionScores = Record<Criterion, number>

export const PROFILES = {
  default: { composition: 0.22, subjects: 0.22, lighting: 0.22, color: 0.12, materials: 0.12, atmosphere: 0.1 },
  interior: { composition: 0.22, subjects: 0.2, lighting: 0.24, color: 0.1, materials: 0.14, atmosphere: 0.1 },
  landscape: { composition: 0.22, subjects: 0.14, lighting: 0.22, color: 0.16, materials: 0.08, atmosphere: 0.18 },
  architecture: { composition: 0.22, subjects: 0.24, lighting: 0.18, color: 0.1, materials: 0.16, atmosphere: 0.1 },
  town: { composition: 0.22, subjects: 0.22, lighting: 0.2, color: 0.12, materials: 0.12, atmosphere: 0.12 },
  character: { composition: 0.18, subjects: 0.3, lighting: 0.18, color: 0.12, materials: 0.14, atmosphere: 0.08 },
  object: { composition: 0.14, subjects: 0.26, lighting: 0.22, color: 0.12, materials: 0.22, atmosphere: 0.04 },
} satisfies Record<string, CriterionScores>
export type SceneType = keyof typeof PROFILES

for (const [type, weights] of Object.entries(PROFILES)) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 1) > 1e-9) throw new Error(`PROFILES.${type} weights sum to ${sum}, expected 1`)
}

const COMPLETE_AT = 8
const CAP_BELOW = 7
const MIN_REVIEWERS = 2
const MAX_SPREAD = 2
const REGRESSION_MARGIN = 0.2
const PLATEAU_ROUNDS = 3
const PLATEAU_GAIN = 0.2
const SECTION_KEY = /^[a-z][a-z0-9_]*$/
const tenths = (value: number) => Math.round(value * 10)

type Scores = Record<string, number>
type Weights = Record<string, number>

interface Review {
  criteria: Record<string, { score: number; evidence: string }>
}

interface Round {
  round: number
  date: string
  type: SceneType
  section?: string
  change: string
  screenshot: string
  screenshots?: string[]
  scores: Scores
  reviews: Review['criteria'][]
  total: number
  capped: boolean
  gates: Record<string, boolean>
  status: 'complete' | 'in-progress'
}

export function computeScore(scores: Scores, weights: Weights) {
  const keys = Object.keys(weights)
  const weighted = keys.reduce((sum, key) => sum + scores[key] * weights[key], 0)
  const capped = keys.some((key) => scores[key] < CAP_BELOW)
  return { total: capped ? Math.min(weighted, COMPLETE_AT - 0.1) : weighted, capped }
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function validateReview(value: unknown, file: string, keys: readonly string[]): Review {
  const review = value as Partial<Review>
  if (!review.criteria || typeof review.criteria !== 'object') fail(`${file}: "criteria" is missing`)
  const extra = Object.keys(review.criteria).filter((key) => !keys.includes(key))
  if (extra.length) fail(`${file}: unexpected criteria ${extra.join(', ')}; this round scores ${keys.join(', ')}`)
  for (const key of keys) {
    const entry = review.criteria[key]
    if (!entry) fail(`${file}: missing criterion "${key}"`)
    if (typeof entry.score !== 'number' || entry.score < 1 || entry.score > 10) fail(`${file}: "${key}.score" must be a number from 1 to 10`)
    if (typeof entry.evidence !== 'string' || !entry.evidence.trim()) fail(`${file}: "${key}.evidence" must describe what was compared`)
  }
  return review as Review
}

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: { change: { type: 'string' } },
  allowPositionals: true,
})
const name = positionals[0]
const change = values.change?.trim()
if (!name || !change) fail('usage: bun run score <scene> --change "<the one change this round tests>"')

const dir = join('scenes', name)
const briefPath = join(dir, 'brief.md')
const historyPath = join(dir, 'scores.json')
if (!existsSync(briefPath)) fail(`${briefPath} not found`)

const { meta, body } = await readBrief(briefPath)
const type = meta.type
if (typeof type !== 'string' || !(type in PROFILES)) {
  fail(`${briefPath}: front matter "type" must be one of: ${Object.keys(PROFILES).join(', ')}`)
}
const sceneType = type as SceneType

const history: Round[] = existsSync(historyPath) ? await Bun.file(historyPath).json() : []
if (history.length && history[0].type !== sceneType) {
  fail(`type changed from "${history[0].type}" to "${sceneType}" after scoring began. Ask the user before re-typing a scored scene; if they agree, delete ${historyPath} to restart its history.`)
}

const reviewFiles = readdirSync(dir).filter((file) => REVIEW_FILE.test(file)).sort()
if (reviewFiles.length < MIN_REVIEWERS) {
  fail(`found ${reviewFiles.length} review file(s) in ${dir}; each round needs at least ${MIN_REVIEWERS} independent reviewers writing review-1.json, review-2.json (docs/scoring.md)`)
}
const rawReviews: { criteria?: Record<string, unknown> }[] = await Promise.all(reviewFiles.map((file) => Bun.file(join(dir, file)).json()))

const pending = pendingDir(dir)
const freezePath = join(pending, 'shots', 'freeze.json')
let frozen: Freeze
if (existsSync(freezePath)) {
  frozen = await Bun.file(freezePath).json()
} else {
  console.log(`no frozen review in ${pending}: freezing the files as they are now. Use \`bun run shot ${name} --review\` before reviewing so the saved files match what reviewers saw.`)
  frozen = (await freeze(name, null, [], undefined, false).catch((error: Error) => fail(error.message))).record
}
const section = frozen.section ?? undefined
const scope = history.filter((entry) => entry.section === section)

let weights: Weights = PROFILES[sceneType]
if (section) {
  const keys = scope.length ? Object.keys(scope[0].scores) : Object.keys(rawReviews[0].criteria ?? {})
  const bad = keys.filter((key) => !SECTION_KEY.test(key))
  if (!keys.length || bad.length) fail(`section "${section}" criteria must be snake_case names; got ${bad.join(', ') || 'none'}`)
  weights = Object.fromEntries(keys.map((key) => [key, 1 / keys.length]))
}
const criteria = Object.keys(weights)
const reviews = rawReviews.map((raw, i) => validateReview(raw, reviewFiles[i], criteria))

const spread = (key: string) => reviews.map((review) => review.criteria[key].score)
const splits = criteria.filter((key) => Math.max(...spread(key)) - Math.min(...spread(key)) > MAX_SPREAD)
if (splits.length && reviews.length < MIN_REVIEWERS + 1) {
  const detail = splits.map((key) => `${key} (${spread(key).join(' vs ')})`).join(', ')
  fail(`reviewers disagree by more than ${MAX_SPREAD} on ${detail}: add review-${reviews.length + 1}.json from another fresh reviewer and rerun`)
}

const scores: Scores = Object.fromEntries(criteria.map((key) => [key, median(spread(key))]))
const result = computeScore(scores, weights)
const total = Math.round(result.total * 10) / 10
const gates = frozen.gates
const gatesPass = Object.values(gates).every(Boolean)
const status = gatesPass && result.total >= COMPLETE_AT ? 'complete' : 'in-progress'
const round = history.length + 1
const saved = roundDir(dir, round)
const screenshots = frozen.screenshots.map((path) => path.replace(pending, saved))

const record: Round = {
  round,
  date: new Date().toISOString(),
  type: sceneType,
  ...(section ? { section } : {}),
  change,
  screenshot: screenshots[0],
  screenshots,
  scores,
  reviews: reviews.map((review) => review.criteria),
  total,
  capped: result.capped,
  gates,
  status,
}
history.push(record)
scope.push(record)
await Bun.write(historyPath, JSON.stringify(history, null, 2) + '\n')

if (!section) {
  meta.score = total
  meta.status = status
  await Bun.write(briefPath, `---\n${Bun.YAML.stringify(meta, null, 2).trimEnd()}\n---\n${body}`)
}

renameSync(pending, saved)
for (const file of reviewFiles) renameSync(join(dir, file), join(saved, file))

const header = reviews.map((_, i) => `r${i + 1}`.padStart(5)).join('')
const width = Math.max(12, ...criteria.map((key) => key.length + 1))
console.log(`${section ? `section: ${section}` : `profile: ${sceneType}`}    change: ${change}`)
console.log(`${'criterion'.padEnd(width)}${header}  median  weight`)
for (const key of criteria) {
  const each = spread(key).map((score) => score.toFixed(1).padStart(5)).join('')
  console.log(`${key.padEnd(width)}${each}  ${scores[key].toFixed(2).padStart(6)}   x${weights[key].toFixed(2)}`)
}
console.log(`${'total'.padEnd(width)}${' '.repeat(header.length)}  ${total.toFixed(1).padStart(6)}   (complete at ${COMPLETE_AT})`)
if (result.capped) console.log(`  capped below ${COMPLETE_AT}: a criterion's median is under ${CAP_BELOW}`)
for (const [gate, passed] of Object.entries(gates)) console.log(`gate ${gate.padEnd(10)} ${passed ? 'pass' : 'FAIL'}`)
if (!gates.console) console.log('  the scene must reach data-scene="ready" with no console errors or warnings')
console.log(`status: ${status} (round ${round}, saved to ${saved})`)

const best = scope.reduce((top, entry) => (entry.total > top.total ? entry : top))
if (best !== record) {
  const bestRound = history.indexOf(best) + 1
  console.log(`best${section ? ` for ${section}` : ''}: round ${bestRound} at ${best.total.toFixed(1)}`)
  if (tenths(best.total - total) > tenths(REGRESSION_MARGIN)) {
    const fix = existsSync(roundDir(dir, bestRound)) ? `run \`bun run restore ${name} ${bestRound}\`` : 'it has no saved files to restore'
    console.log(`REGRESSED: more than ${REGRESSION_MARGIN} below the best round. Drop this change: ${fix} before the next one.`)
  } else if (total < best.total) {
    console.log(`  within ${REGRESSION_MARGIN} of the best, which is reviewer noise: keep the change only if the evidence says it helped`)
  }
}

if (status !== 'complete' && scope.length > PLATEAU_ROUNDS) {
  const before = Math.max(...scope.slice(0, -PLATEAU_ROUNDS).map((entry) => entry.total))
  const recent = Math.max(...scope.slice(-PLATEAU_ROUNDS).map((entry) => entry.total))
  if (tenths(recent - before) < tenths(PLATEAU_GAIN)) {
    console.log(`PLATEAU: the last ${PLATEAU_ROUNDS} rounds beat the earlier best by less than +${PLATEAU_GAIN}. Stop iterating and report the blocking criteria to the user.`)
  }
}
