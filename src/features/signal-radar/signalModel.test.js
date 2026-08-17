import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filterSignals,
  getSignalSummary,
  getThemeEvidence,
  isSignalStale,
  sortSignals,
} from './signalModel.js'

test('combines category, importance, and evidence filters', () => {
  const signals = [
    { id: 'a', category: 'policy', importance: 'high', evidenceType: 'official' },
    { id: 'b', category: 'policy', importance: 'medium', evidenceType: 'official' },
    { id: 'c', category: 'market', importance: 'high', evidenceType: 'proxy' },
  ]

  assert.deepEqual(filterSignals(signals, {
    category: 'policy', importance: 'high', evidenceType: 'official',
  }).map(({ id }) => id), ['a'])
})

test('sorts importance, evidence quality, then observation date without mutation', () => {
  const signals = [
    { id: 'proxy', importance: 'high', evidenceType: 'proxy', observedAt: '2026-08-12' },
    { id: 'official-old', importance: 'high', evidenceType: 'official', observedAt: '2026-08-10' },
    { id: 'medium', importance: 'medium', evidenceType: 'official', observedAt: '2026-08-13' },
  ]

  assert.deepEqual(sortSignals(signals).map(({ id }) => id), ['official-old', 'proxy', 'medium'])
  assert.deepEqual(signals.map(({ id }) => id), ['proxy', 'official-old', 'medium'])
})

test('marks a signal stale using its explicit validThrough date', () => {
  assert.equal(isSignalStale({ validThrough: '2026-08-12' }, new Date('2026-08-13T00:00:00+08:00')), true)
  assert.equal(isSignalStale({ validThrough: '2026-08-13' }, new Date('2026-08-13T23:59:59+08:00')), false)
  assert.equal(isSignalStale({}, new Date('2026-08-13T00:00:00+08:00')), false)
})

test('returns supporting and counter evidence for a complete theme', () => {
  const signals = [{ id: 'a' }, { id: 'b' }]
  assert.deepEqual(getThemeEvidence({ signalIds: ['a'], counterSignalIds: ['b'] }, signals), {
    supporting: [signals[0]], counter: [signals[1]], isComplete: true,
  })
})

test('summarizes visible signal counts and excludes stale items from top call candidates', () => {
  const signals = [
    { id: 'a', importance: 'high', evidenceType: 'official', observedAt: '2026-08-12', validThrough: '2026-08-20' },
    { id: 'b', importance: 'high', evidenceType: 'proxy', observedAt: '2026-08-13', validThrough: '2026-08-12' },
    { id: 'c', importance: 'medium', evidenceType: 'demo', observedAt: '2026-08-13' },
  ]
  const summary = getSignalSummary(signals, new Date('2026-08-13T12:00:00+08:00'))

  assert.equal(summary.total, 3)
  assert.equal(summary.highImportance, 2)
  assert.equal(summary.official, 1)
  assert.equal(summary.proxyOrDemo, 2)
  assert.equal(summary.topSignal.id, 'a')
})
