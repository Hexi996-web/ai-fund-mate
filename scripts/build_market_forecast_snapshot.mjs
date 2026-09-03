import { readFile, writeFile } from 'node:fs/promises'
import { createMarketForecastSnapshot } from '../src/data/marketForecast.js'

const sourcePath = new URL('../public/fund_products.json', import.meta.url)
const targetPath = new URL('../public/market_forecast.json', import.meta.url)
const payload = JSON.parse(await readFile(sourcePath, 'utf8'))

if (!Array.isArray(payload?.products) || payload.products.length === 0) {
  throw new Error('Cannot build market forecast snapshot: fund_products.json has no products')
}

const snapshot = createMarketForecastSnapshot(payload)
await writeFile(targetPath, `${JSON.stringify(snapshot)}\n`, 'utf8')
console.log(`Built market forecast snapshot for ${snapshot.dataDate}: ${snapshot.rows.length} categories`)
