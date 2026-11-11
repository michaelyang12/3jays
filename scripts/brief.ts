export function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

export async function readBrief(path: string) {
  const text = await Bun.file(path).text()
  const match = text.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) fail(`${path}: missing YAML front matter`)
  return { meta: Bun.YAML.parse(match[1]) as Record<string, unknown>, body: text.slice(match[0].length) }
}
