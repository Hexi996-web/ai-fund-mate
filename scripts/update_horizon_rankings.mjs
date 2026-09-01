import { readFile, writeFile } from 'node:fs/promises'
import { buildRankedDirections, HORIZON_IDS } from '../src/data/horizonRanking.js'

const root = new URL('../public/', import.meta.url)
const read = async (name) => JSON.parse(await readFile(new URL(name, root), 'utf8'))
const snapshot = await read('attention_pool_evidence.json')
const evidence = await read('pre_research_evidence.json')
const external = await read('theme_external_signals.json')
const current = snapshot.rankingHistory?.at(-1)
if (!current) throw new Error('rankingHistory is empty')
current.horizonRankedIds = Object.fromEntries(HORIZON_IDS.map((horizon) => [
  horizon,
  buildRankedDirections(snapshot, horizon, evidence.items || [], external.items || []).map(({ id }) => id),
]))
await writeFile(new URL('attention_pool_evidence.json', root), `${JSON.stringify(snapshot)}\n`)
console.log(`stored horizon rankings for ${current.date}`)
