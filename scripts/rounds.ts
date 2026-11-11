import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const NOT_SNAPSHOTTED = new Set(['refs', 'assets', 'rounds', 'shots', 'scores.json'])
const NOT_RESTORED = /^(brief\.md|review(-\d+)?\.json|screenshot\.\w+)$/

export const roundDir = (sceneDir: string, round: number) => join(sceneDir, 'rounds', `r${round}`)

export const pendingDir = (sceneDir: string) => join(sceneDir, 'rounds', 'pending')

export function snapshot(sceneDir: string, target: string) {
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(sceneDir)) {
    if (!NOT_SNAPSHOTTED.has(entry)) cpSync(join(sceneDir, entry), join(target, entry), { recursive: true })
  }
}

function sourceFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const rel = prefix ? join(prefix, entry) : entry
    if (!prefix && (NOT_SNAPSHOTTED.has(entry) || NOT_RESTORED.test(entry) || entry.startsWith('.'))) return []
    return statSync(join(dir, entry)).isDirectory() ? sourceFiles(join(dir, entry), rel) : [rel]
  })
}

export function sourceDiff(sceneDir: string, saved: string) {
  const current = new Set(sourceFiles(sceneDir))
  const kept = new Set(sourceFiles(saved))
  const changed: string[] = []
  for (const file of new Set([...current, ...kept])) {
    if (!current.has(file) || !kept.has(file) || !readFileSync(join(sceneDir, file)).equals(readFileSync(join(saved, file)))) changed.push(file)
  }
  return changed.sort()
}

export function restoreSources(sceneDir: string, saved: string) {
  const kept = new Set(sourceFiles(saved))
  for (const file of sourceFiles(sceneDir)) if (!kept.has(file)) rmSync(join(sceneDir, file))
  for (const file of kept) cpSync(join(saved, file), join(sceneDir, file))
}
