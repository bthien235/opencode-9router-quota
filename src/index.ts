import { Model, Plugin, Provider } from "@opencode/plugin"

type CustomProviderType = "openai-compatible" | "anthropic"

interface CustomProviderRecord {
  /** providerID trong opencode, vi du: "my-9router", "my-claude" (slug, khong dau, khong khoang trang) */
  id: string
  /** Ten hien thi do user dat, vi du: "9Router local", "Claude chinh" */
  name: string
  type: CustomProviderType
  baseURL: string
  apiKey: string
  models: string[]
  createdAt: string
}

const STORAGE_KEY = "custom-providers"

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "custom"
  )
}

function asProviderID(id: string): any {
  const P: any = Provider as any
  try {
    if (P?.ID?.make) return P.ID.make(id)
  } catch {}
  return id
}

function asModelID(id: string): any {
  const M: any = Model as any
  try {
    if (M?.ID?.make) return M.ID.make(id)
  } catch {}
  return id
}

function emptyProviderInfo(providerID: any): any {
  const P: any = Provider as any
  try {
    if (P?.Info?.empty) return P.Info.empty(providerID)
  } catch {}
  return { id: providerID }
}

function defaultModelInfo(providerID: any, modelID: any): any {
  const M: any = Model as any
  try {
    if (M?.Info?.default) return M.Info.default(providerID, modelID)
  } catch {}
  return { id: modelID, providerID }
}

async function loadCustomProviders(ctx: any): Promise<CustomProviderRecord[]> {
  try {
    const raw = await ctx.storage.get(STORAGE_KEY)
    if (Array.isArray(raw)) return raw as CustomProviderRecord[]
    if (raw && Array.isArray((raw as any).items)) return (raw as any).items
    if (raw && Array.isArray((raw as any).providers)) return (raw as any).providers
  } catch {}
  return []
}

export default Plugin.define({
  id: "9router-quota",
  async setup(ctx) {
    let customs = await loadCustomProviders(ctx)
    const registration = await ctx.provider.transform((editor: any) => {
      for (const c of customs) {
            const providerID = asProviderID(c.id || slugify(c.name))
            const pkg =
              c.type === "anthropic"
                ? "@opencode/ai/providers/anthropic"
                : "@opencode/ai/providers/openai-compatible"
            const settings: Record<string, unknown> =
              c.type === "anthropic"
                ? { baseURL: c.baseURL || undefined, apiKey: c.apiKey }
                : { baseURL: c.baseURL, apiKey: c.apiKey }
            const info = {
              ...emptyProviderInfo(providerID),
              id: providerID,
              name: c.name || c.id,
              activation: "enabled",
              package: pkg,
              settings,
            }
            const models = (c.models ?? []).map((m) => ({
              ...defaultModelInfo(providerID, asModelID(m)),
              id: asModelID(m),
              providerID,
              name: m,
            }))
            try {
              if (editor.get?.(providerID)) {
                editor.update(providerID, (p: any) => {
                  p.name = c.name || c.id
                  p.package = pkg
                  p.settings = settings
                })
                editor.models.set(providerID, models)
              } else {
                editor.add({ info, models })
              }
            } catch (e) {
              console.warn(`[9router-quota] skip provider ${c.id}:`, (e as Error)?.message)
            }
      }
    })

    // TUI ghi storage khi user Connect xong -> poll de nap lai ma khong can restart.
    // Giu nhe: 30s/lan, chi reload khi so luong/id doi.
    let lastSig = JSON.stringify(customs)
    const timer = setInterval(async () => {
      try {
        const next = await loadCustomProviders(ctx)
        const sig = JSON.stringify(next)
        if (sig !== lastSig) {
          lastSig = sig
          customs = next
          await ctx.provider.reload()
        }
      } catch {}
    }, 30_000)
    try {
      ;(timer as any)?.unref?.()
    } catch {}

    return async () => {
      clearInterval(timer)
      await registration.dispose()
    }
  },
})

export { slugify }
export type { CustomProviderRecord, CustomProviderType }
