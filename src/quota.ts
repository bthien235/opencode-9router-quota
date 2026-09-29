export interface WindowQuota {
  label: string
  percent: number
}

export function quotaLabelWidth(windows: WindowQuota[]): number {
  return Math.min(16, Math.max(2, ...windows.map((window) => window.label.length)))
}

export function quotaRow(window: WindowQuota, width: number): string {
  const label = window.label.length > width
    ? `${window.label.slice(0, width - 1)}…`
    : window.label.padEnd(width)
  const filled = Math.round(Math.max(0, Math.min(100, window.percent)) / 10)
  return `  ${label} ${"█".repeat(filled)}${"░".repeat(10 - filled)} ${Math.round(window.percent)}%`
}

function displayQuotaLabel(key: string): string {
  const label = key.replace(/_/g, " ").trim()
  if (/^(session(?:\s*\(?5h\)?)?|5h)$/i.test(label)) return "5h"
  if (/^(weekly|7d)$/i.test(label)) return "7d"
  const compact = label.replace(/\bsession(?:\s*\(?5h\)?)?\b/i, "5h")
    .replace(/\bweekly\b/i, "7d")
  return compact === label ? label : compact.replace(/^\w/, (letter) => letter.toUpperCase())
}

const PREFIX_TO_PROVIDER: Record<string, string[]> = {
  cc: ["claude"], cx: ["codex"], kr: ["kiro"], cmc: ["commandcode"],
  ocg: ["opencode-go"], ocz: ["opencode-zen"], gc: ["gemini-cli"],
  ag: ["antigravity"], gh: ["github"], qd: ["qoder"], qdcn: ["qoder-cn"],
  gcli: ["grok-cli"], cbai: ["codebuddy-intl"], cbcn: ["codebuddy-cn"],
  ds: ["deepseek"], tr: ["trae"], vercel: ["vercel-ai-gateway"],
  mimo: ["xiaomi-mimo"], zd: ["zed"],
}

export function providersForModel(modelID: string): string[] {
  const prefix = modelID.split("/")[0]
  return PREFIX_TO_PROVIDER[prefix] ?? [prefix]
}

export function activeForProvider<T extends { isActive?: boolean; provider?: string }>(connections: T[], providers: string[]): T[] {
  const wanted = new Set(providers.map((name) => name.toLowerCase()))
  return connections.filter((connection) => connection.isActive !== false && wanted.has(String(connection.provider ?? "").toLowerCase()))
}

export function quotaWindows(data: any): WindowQuota[] {
  const quotas = data?.quotas
  if (quotas && typeof quotas === "object") {
    return Object.entries(quotas).flatMap(([key, value]) => {
      const q = value as any
      if (q?.unlimited === true) return []
      const percent = q?.remainingPercentage ?? q?.remainingPct ?? q?.remainingPercent
      let remainingPercent: number
      if (percent != null && Number.isFinite(Number(percent))) {
        remainingPercent = Number(percent)
      } else if (q?.total != null && Number(q.total) > 0 && q?.remaining != null) {
        remainingPercent = Number(q.remaining) / Number(q.total) * 100
      } else if (q?.total != null && Number(q.total) > 0 && q?.used != null) {
        remainingPercent = (1 - Number(q.used) / Number(q.total)) * 100
      } else return []
      if (!Number.isFinite(remainingPercent)) return []
      return [{ label: displayQuotaLabel(key), percent: Math.round(Math.max(0, Math.min(100, remainingPercent))) }]
    })
  }
  const left = data?.remaining ?? data?.quota?.remaining
  const max = data?.total ?? data?.limit ?? data?.quota?.limit
  if (left == null || max == null) return []
  const remaining = Number(left)
  const total = Number(max)
  if (!Number.isFinite(remaining) || !Number.isFinite(total) || total <= 0) return []
  return [{ label: "Left", percent: Math.round(Math.max(0, Math.min(100, remaining / total * 100))) }]
}
