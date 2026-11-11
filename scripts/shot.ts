import { $ } from 'bun'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium, type Browser } from 'playwright-core'
import { fail, readBrief } from './brief'
import { pendingDir, snapshot } from './rounds'

const DEV_URL = 'http://localhost:5173'
const LONG_EDGE = 1200
const DEFAULT_ASPECT = '16:9'
const SETTLE_MS = 30_000
const HERO = 'hero'
export const REVIEW_FILE = /^review-\d+\.json$/

export interface Viewport {
  width: number
  height: number
}

export interface Shot {
  view: string
  out: string | null
}

export interface Capture {
  status: string
  problems: string[]
  overlay: string | null
  views: string[]
  saved: { view: string; out: string; viewport: Viewport }[]
}

export interface Freeze {
  date: string
  section: string | null
  views: string[]
  screenshots: string[]
  gates: Record<string, boolean>
}

function viewport(aspect: string, longEdge: number): Viewport {
  const match = aspect.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/)
  if (!match) throw new Error(`aspect "${aspect}" must look like 3:2`)
  const ratio = Number(match[1]) / Number(match[2])
  return ratio >= 1
    ? { width: longEdge, height: Math.round(longEdge / ratio) }
    : { width: Math.round(longEdge * ratio), height: longEdge }
}

async function briefAspect(name: string) {
  const briefPath = join('scenes', name, 'brief.md')
  const aspect = existsSync(briefPath) ? (await readBrief(briefPath)).meta.aspect : undefined
  return typeof aspect === 'string' ? aspect : DEFAULT_ASPECT
}

async function launch(): Promise<Browser> {
  const args = ['--enable-gpu', '--ignore-gpu-blocklist']
  if (process.platform === 'darwin') args.push('--use-angle=metal')
  try {
    return await chromium.launch({ channel: 'chrome', headless: true, args })
  } catch {
    try {
      return await chromium.launch({ headless: true, args })
    } catch {
      throw new Error('no browser found: install Google Chrome, or run `bunx playwright install chromium`')
    }
  }
}

// `pick` chooses what to shoot once the scene has loaded and its view ids are known.
export async function capture(name: string, pick: (views: string[]) => Shot[], longEdge = LONG_EDGE): Promise<Capture> {
  const reachable = await fetch(DEV_URL).then(() => true, () => false)
  if (!reachable) throw new Error(`no dev server at ${DEV_URL}: start \`bun run dev\` in the background first`)

  const fallbackAspect = await briefAspect(name)
  const browser = await launch()
  try {
    const page = await browser.newPage({ viewport: viewport(fallbackAspect, longEdge) })
    const problems: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') problems.push(`${message.type()}: ${message.text()}`)
    })
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) problems.length = 0
    })
    const waitSettled = () =>
      page
        .waitForFunction(() => /^(ready|error)$/.test(document.documentElement.dataset.scene ?? ''), null, { timeout: SETTLE_MS })
        .then(() => true, () => false)
    const nextFrame = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

    await page.goto(`${DEV_URL}/?scene=${encodeURIComponent(name)}`)
    let settled = await waitSettled()
    if (!settled && problems.some((problem) => problem.includes('Outdated Optimize Dep'))) {
      await page.reload()
      settled = await waitSettled()
    }

    const scene = (await page.evaluate(() => document.documentElement.dataset.scene)) ?? 'unset'
    const status = settled ? scene : `timed out after ${SETTLE_MS / 1000}s while ${scene}`
    const overlay = status === 'error' ? await page.locator('#overlay').textContent() : null
    const result: Capture = { status, problems, overlay, views: [], saved: [] }
    if (status !== 'ready') return result

    const aspects: Record<string, string | undefined> = await page.evaluate((hero) => {
      const { view, views } = (window as unknown as { __3jays: { view?: { aspect?: string }; views: Record<string, { aspect?: string }> } }).__3jays
      return { [hero]: view?.aspect, ...Object.fromEntries(Object.entries(views).map(([id, each]) => [id, each.aspect])) }
    }, HERO)
    result.views = Object.keys(aspects).filter((id) => id !== HERO)

    for (const shot of pick(result.views)) {
      if (!(shot.view in aspects)) throw new Error(`scene "${name}" has no view "${shot.view}". Views: ${result.views.join(', ') || 'none'}`)
      const size = viewport(aspects[shot.view] ?? fallbackAspect, longEdge)
      await page.setViewportSize(size)
      if (shot.view !== HERO) {
        await page.evaluate((id) => (window as unknown as { __3jays: { setView: (id: string) => void } }).__3jays.setView(id), shot.view)
      }
      await nextFrame()
      if (!shot.out) continue
      mkdirSync(dirname(shot.out), { recursive: true })
      await page.screenshot({ path: shot.out })
      result.saved.push({ view: shot.view, out: shot.out, viewport: size })
    }
    return result
  } finally {
    await browser.close()
  }
}

async function runGate(script: string) {
  const result = await $`bun run ${script}`.quiet().nothrow()
  return result.exitCode === 0
}

// Copies the scene's files next to the screenshots reviewers will score, so `score` records exactly what was reviewed.
export async function freeze(name: string, section: string | null, wanted: string[], longEdge = LONG_EDGE, clearReviews = true) {
  const dir = join('scenes', name)
  const target = pendingDir(dir)
  rmSync(target, { recursive: true, force: true })
  const stale = clearReviews ? readdirSync(dir).filter((file) => REVIEW_FILE.test(file)) : []
  for (const file of stale) rmSync(join(dir, file))
  snapshot(dir, target)

  const shots = join(target, 'shots')
  const result = await capture(
    name,
    (views) => {
      const picked = wanted.length ? wanted : section ? views.filter((id) => id.startsWith(`${section}-`)) : [HERO]
      if (!picked.length) throw new Error(`no views start with "${section}-". Views: ${views.join(', ') || 'none'}`)
      return picked.map((view) => ({ view, out: join(shots, `${view}.png`) }))
    },
    longEdge,
  )
  const record: Freeze = {
    date: new Date().toISOString(),
    section,
    views: result.saved.map((shot) => shot.view),
    screenshots: result.saved.map((shot) => shot.out),
    gates: {
      typecheck: await runGate('typecheck'),
      build: await runGate('build'),
      console: result.status === 'ready' && result.problems.length === 0,
    },
  }
  await Bun.write(join(shots, 'freeze.json'), JSON.stringify(record, null, 2) + '\n')
  return { record, result, stale }
}

function report(result: Capture) {
  for (const shot of result.saved) console.log(`saved ${shot.out} (${shot.viewport.width}x${shot.viewport.height}, view ${shot.view})`)
  console.log(`scene: ${result.status}`)
  if (result.overlay) console.log(result.overlay)
  console.log(result.problems.length ? result.problems.join('\n') : 'console clean')
}

if (import.meta.main) {
  const usage = 'usage: bun run shot <scene> [--view <id,id> | --all | --section <name>] [--review] [--out <path>] [--long-edge <px>]'
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      view: { type: 'string' },
      all: { type: 'boolean', default: false },
      section: { type: 'string' },
      review: { type: 'boolean', default: false },
      out: { type: 'string' },
      'long-edge': { type: 'string' },
    },
    allowPositionals: true,
  })
  const name = positionals[0]
  if (!name) fail(usage)
  if (!existsSync(join('scenes', name, 'scene.ts'))) fail(`scenes/${name}/scene.ts not found`)
  const longEdge = Number(values['long-edge'] ?? LONG_EDGE)
  const wanted = values.view ? values.view.split(',').map((id) => id.trim()) : []
  const section = values.section ?? null

  if (values.review) {
    if (values.out || values.all) fail('--review picks its own output paths and views; drop --out and --all')
    const { record, result, stale } = await freeze(name, section, wanted, longEdge).catch((error: Error) => fail(error.message))
    report(result)
    if (stale.length) console.log(`removed unscored ${stale.join(', ')} from an earlier review`)
    for (const [gate, passed] of Object.entries(record.gates)) console.log(`gate ${gate.padEnd(10)} ${passed ? 'pass' : 'FAIL'}`)
    console.log(`frozen ${section ? `section ${section}` : 'scene'} in ${pendingDir(join('scenes', name))}: reviewers score the screenshots above, and you can keep editing meanwhile`)
    if (result.status !== 'ready' || result.problems.length) process.exit(1)
  } else {
    const shotsDir = join('scenes', name, 'shots')
    const result = await capture(
      name,
      (views) => {
        const picked = wanted.length ? wanted : values.all ? [HERO, ...views] : section ? views.filter((id) => id.startsWith(`${section}-`)) : [HERO]
        if (!picked.length) throw new Error(`no views start with "${section}-". Views: ${views.join(', ') || 'none'}`)
        if (values.out && picked.length > 1) throw new Error('--out takes one view; drop it to save each view under shots/')
        return picked.map((view) => ({ view, out: values.out ?? join(shotsDir, view === HERO ? 'latest.png' : `${view}.png`) }))
      },
      longEdge,
    ).catch((error: Error) => fail(error.message))
    report(result)
    if (result.status !== 'ready' || result.problems.length) process.exit(1)
  }
}
