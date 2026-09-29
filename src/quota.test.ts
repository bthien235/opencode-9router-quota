import { test, expect } from "bun:test"
import { activeForProvider, providersForModel, quotaLabelWidth, quotaRow, quotaWindows } from "./quota"

test("Codex session and weekly remaining", () => {
  expect(quotaWindows({ quotas: { session: { remaining: 27, total: 100 }, weekly: { remaining: 83, total: 100 } } }))
    .toEqual([{ label: "5h", percent: 27 }, { label: "7d", percent: 83 }])
})

test("missing or invalid quota does not invent a percentage", () => {
  expect(quotaWindows({ message: "Usage API temporarily unavailable" })).toEqual([])
  expect(quotaWindows({ quotas: { session: { remaining: null, total: 0 } } })).toEqual([])
  expect(quotaWindows({ quotas: { session: { remaining: null, total: 100 } } })).toEqual([])
})

test("only active accounts for selected provider", () => {
  expect(activeForProvider([
    { provider: "codex", isActive: true },
    { provider: "codex", isActive: false },
    { provider: "codex" },
    { provider: "claude", isActive: true },
  ], ["codex"])).toHaveLength(2)
})

test("other provider quota shapes", () => {
  expect(quotaWindows({ quotas: {
    gemini: { remainingPercentage: 42, total: 1000, used: 580 },
    chat: { used: 4, total: 10 },
    unlimited: { unlimited: true, total: 100, remaining: 100 },
  } })).toEqual([{ label: "gemini", percent: 42 }, { label: "chat", percent: 60 }])
})

test("model aliases match only their provider", () => {
  expect(providersForModel("cmc/claude-sonnet-4")).toEqual(["commandcode"])
  expect(providersForModel("cf/llama")).toEqual(["cf"])
  expect(providersForModel("cx/gpt-6")).toEqual(["codex"])
})

test("commandcode windows have compact labels", () => {
  expect(quotaWindows({ quotas: {
    Credits: { remaining: 45, total: 100 },
    "Session (5h)": { remaining: 98, total: 100 },
    Weekly: { remaining: 47, total: 100 },
  } })).toEqual([
    { label: "Credits", percent: 45 },
    { label: "5h", percent: 98 },
    { label: "7d", percent: 47 },
  ])
})

test("other providers align bars within a group and shorten time windows", () => {
  const first = quotaWindows({ quotas: {
    spark_session: { remaining: 62, total: 100 },
    spark_weekly: { remaining: 48, total: 100 },
  } })
  const second = quotaWindows({ quotas: { session: { remaining: 23, total: 100 } } })
  expect(first.map((window) => window.label)).toEqual(["Spark 5h", "Spark 7d"])
  const width = quotaLabelWidth([...first, ...second])
  expect(quotaRow(first[0], width).indexOf("█")).toBe(quotaRow(second[0], width).indexOf("█"))
  expect(quotaLabelWidth([])).toBe(2)
})
