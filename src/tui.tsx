import { Plugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/plugin"
import { createEffect, createMemo, on, Show, For, onMount, onCleanup } from "solid-js"
import { activeForProvider, providersForModel, quotaLabelWidth, quotaRow, quotaWindows, type WindowQuota } from "./quota"

type CustomType = "openai-compatible" | "anthropic"
interface CustomProvider {
  id: string
  name: string
  type: CustomType
  baseURL: string
  apiKey: string
  models: string[]
  createdAt: string
}
interface CustomStore {
  items: CustomProvider[]
}
interface NineStore {
  baseUrl: string
  password: string
  quotaAutoRefresh?: boolean
}
interface QuotaAccount {
  label: string
  provider: string
  windows: WindowQuota[]
  error?: string
}

const CUSTOM_KEY = "custom-providers"
const NINE_KEY = "nine-settings"

function slugify(input: string): string {
  const s = (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
  return s || `custom-${Date.now().toString(36)}`
}

function normBase(u: string): string {
  return (u || "").trim().replace(/\/+$/, "")
}

function openaiModelsUrl(baseURL: string): string {
  const b = normBase(baseURL).replace(/\/chat\/completions$/, "")
  return `${b}/models`
}

function anthropicModelsUrl(baseURL: string): string {
  const b = normBase(baseURL)
  if (!b) return "https://api.anthropic.com/v1/models"
  if (/\/v1(\/models)?$/.test(b)) return b.endsWith("/models") ? b : `${b}/models`
  return `${b}/v1/models`
}

async function fetchOpenAIModels(baseURL: string, apiKey: string): Promise<string[]> {
  const res = await fetch(openaiModelsUrl(baseURL), {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) throw new Error(`Models: HTTP ${res.status}`)
  const j: any = await res.json()
  const arr = Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : []
  return arr.map((m: any) => String(m?.id ?? m?.name ?? m)).filter(Boolean)
}

async function fetchAnthropicModels(baseURL: string, apiKey: string): Promise<string[]> {
  const res = await fetch(anthropicModelsUrl(baseURL), {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) throw new Error(`Models: HTTP ${res.status}`)
  const j: any = await res.json()
  const arr = Array.isArray(j?.data) ? j.data : []
  return arr.map((m: any) => String(m?.id ?? "")).filter(Boolean)
}

async function upsertGlobalProvider(entry: { id: string; name: string; type: CustomType; baseURL: string; apiKey: string; models: string[] }) {
  // Server-side provider transform reads server storage, which the TUI cannot
  // reliably share. Write to the global opencode.json instead, using the same
  // "provider" + "npm/options/models" shape as existing working 9Router entries.
  const { readFile, copyFile, writeFile, rename, unlink, chmod, stat } = await import("node:fs/promises")
  const { join } = await import("node:path")
  const { homedir } = await import("node:os")
  const configPath = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opencode", "opencode.json")
  let raw = ""
  let config: Record<string, any> = {}
  try {
    raw = await readFile(configPath, "utf8")
  } catch {
    throw new Error("Global opencode.json not found")
  }
  try {
    config = JSON.parse(raw.replace(/^\uFEFF/, ""))
  } catch {
    throw new Error("opencode.json is JSONC or invalid; add the provider manually")
  }
  if (config.provider != null && (typeof config.provider !== "object" || Array.isArray(config.provider))) {
    throw new Error("Unexpected provider section; add the provider manually")
  }
  config.provider = config.provider ?? {}
  const modelsObj: Record<string, { name: string }> = {}
  for (const m of entry.models) modelsObj[m] = { name: m }
  const baseURL = normBase(entry.baseURL)
  config.provider[entry.id] =
    entry.type === "anthropic"
      ? {
          npm: "@ai-sdk/anthropic",
          name: entry.name,
          options: { ...(baseURL ? { baseURL } : {}), apiKey: entry.apiKey },
          models: modelsObj,
        }
      : {
          npm: "@ai-sdk/openai-compatible",
          name: entry.name,
          options: { baseURL, apiKey: entry.apiKey },
          models: modelsObj,
        }
  if (await readFile(configPath, "utf8") !== raw) throw new Error("Config changed; retry")
  const backup = `${configPath}.bak-${Date.now()}`
  try {
    await copyFile(configPath, backup)
    await chmod(backup, 0o600)
  } catch {}
  const temp = `${configPath}.tmp-${Date.now()}`
  try {
    const ending = raw.includes("\r\n") ? "\r\n" : "\n"
    const prefix = raw.startsWith("\uFEFF") ? "\uFEFF" : ""
    await writeFile(temp, prefix + JSON.stringify(config, null, 2).replace(/\n/g, ending) + ending, { encoding: "utf8", flag: "wx", mode: 0o600 })
    try {
      await chmod(temp, (await stat(configPath)).mode)
    } catch {}
    await rename(temp, configPath)
  } catch (error) {
    await unlink(temp).catch(() => {})
    throw error
  }
}

async function refreshProviderModelList(ctx: Context) {
  const loc = ctx.location ?? ctx.data.location.default()
  try {
    await ctx.data.location.provider.sync(loc)
  } catch {}
  try {
    await ctx.data.location.model.sync(loc)
  } catch {}
}

async function saveConnection(ctx: Context, existing?: CustomProvider) {
  const name = existing?.name ?? await ctx.ui.dialog.prompt({ title: "Provider name", placeholder: "My provider" })
  if (!name) return
  const type = existing?.type ?? await ctx.ui.dialog.select({
    title: "API type",
    options: [
      { title: "OpenAI-compatible", value: "openai-compatible" },
      { title: "Anthropic", value: "anthropic" },
    ],
  }) as CustomType | undefined
  if (!type) return
  const baseURL = await ctx.ui.dialog.prompt({
    title: "Base URL",
    value: existing?.baseURL ?? (type === "anthropic" ? "" : "http://127.0.0.1:20128/v1"),
  })
  if (baseURL === undefined || (type === "openai-compatible" && !baseURL)) return
  const apiKey = await ctx.ui.dialog.prompt({ title: "API key", placeholder: "New key" })
  if (!apiKey) return
  const models = type === "anthropic"
    ? await fetchAnthropicModels(baseURL, apiKey)
    : await fetchOpenAIModels(baseURL, apiKey)
  if (!models.length) throw new Error("No models found")
  const [store, update] = ctx.storage.store<CustomStore>(CUSTOM_KEY, { initial: { items: [] } })
  const used = new Set([...store.items.map((item) => item.id), ...(ctx.data.location.provider.list(ctx.location) ?? []).map((item) => item.id)])
  let id = existing?.id ?? slugify(name)
  if (!existing && used.has(id)) id = `${id}-${Date.now().toString(36).slice(-4)}`
  if (!existing && !await ctx.ui.dialog.confirm({ title: `Add ${name}?`, message: `${models.length} models` })) return
  await update((draft) => {
    const item = draft.items.find((entry) => entry.id === id)
    if (item) {
      item.baseURL = normBase(baseURL)
      item.apiKey = apiKey
      item.models = models
    } else {
      draft.items.push({ id, name, type, baseURL: normBase(baseURL), apiKey, models, createdAt: new Date().toISOString() })
    }
  })
  await upsertGlobalProvider({ id, name, type, baseURL, apiKey, models })
  await refreshProviderModelList(ctx)
  ctx.ui.toast.show({ message: `${name}: saved (${models.length} models). Check /model.`, variant: "success" })
}

async function chooseCustom(ctx: Context): Promise<CustomProvider | undefined> {
  const [store] = ctx.storage.store<CustomStore>(CUSTOM_KEY, { initial: { items: [] } })
  if (!store.items.length) {
    ctx.ui.toast.show({ message: "No connections", variant: "info" })
    return
  }
  const id = await ctx.ui.dialog.select({
    title: "Connections",
    options: store.items.map((item) => ({ title: item.name, value: item.id, description: `${item.models.length} models` })),
  })
  return store.items.find((item) => item.id === id)
}

async function manageConnections(ctx: Context) {
  const [store] = ctx.storage.store<CustomStore>(CUSTOM_KEY, { initial: { items: [] } })
  const { readFile, copyFile, writeFile, rename, unlink, chmod, stat } = await import("node:fs/promises")
  const { join } = await import("node:path")
  const { homedir } = await import("node:os")
  const configPath = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opencode", "opencode.json")
  let config: Record<string, any> = {}
  let raw = ""
  try {
    raw = await readFile(configPath, "utf8")
    config = JSON.parse(raw.replace(/^\uFEFF/, ""))
  } catch {
    // JSONC or missing global config: still allow managing plugin-owned providers.
  }
  const configIDs = Object.keys(config.provider ?? {}).filter((id) => !store.items.some((item) => item.id === id))
  const target = await ctx.ui.dialog.select({
    title: "Connections",
    options: [
      ...store.items.map((item) => ({ title: item.name, value: `plugin:${item.id}`, description: "Plugin" })),
      ...configIDs.map((id) => ({ title: config.provider[id]?.name || id, value: `config:${id}`, description: "Config" })),
    ],
  }) as string | undefined
  if (!target) return
  if (target.startsWith("config:")) {
    const id = target.slice(7)
    const confirmed = await ctx.ui.dialog.confirm({
      title: `Delete ${id}?`,
      message: "Remove from opencode.json (backup created).",
    })
    if (!confirmed) return
    if (!raw || !config.provider?.[id]) throw new Error("Config unavailable")
    // Refuse concurrent edits instead of overwriting them; keep full backup with secrets private.
    if (await readFile(configPath, "utf8") !== raw) throw new Error("Config changed; retry")
    const backup = `${configPath}.bak-${Date.now()}`
    await copyFile(configPath, backup)
    await chmod(backup, 0o600)
    delete config.provider[id]
    const temp = `${configPath}.tmp-${Date.now()}`
    try {
      const ending = raw.includes("\r\n") ? "\r\n" : "\n"
      const prefix = raw.startsWith("\uFEFF") ? "\uFEFF" : ""
      await writeFile(temp, prefix + JSON.stringify(config, null, 2).replace(/\n/g, ending) + ending, { encoding: "utf8", flag: "wx", mode: 0o600 })
      await chmod(temp, (await stat(configPath)).mode)
      await rename(temp, configPath)
    } catch (error) {
      await unlink(temp).catch(() => {})
      throw error
    }
    await refreshProviderModelList(ctx)
    ctx.ui.toast.show({ message: `${id}: deleted. Restart OpenCode.`, variant: "success" })
    return
  }
  const provider = store.items.find((item) => `plugin:${item.id}` === target)
  if (!provider) return
  const action = await ctx.ui.dialog.select({
    title: provider.name,
    options: [
      { title: "Reconnect", value: "reconnect" },
      { title: "Delete", value: "delete" },
    ],
  })
  if (action === "reconnect") return saveConnection(ctx, provider)
  if (action !== "delete") return
  const confirmed = await ctx.ui.dialog.confirm({
    title: `Delete ${provider.name}?`,
    message: "Remove this plugin connection and its key.",
  })
  if (!confirmed) return
  const [, update] = ctx.storage.store<CustomStore>(CUSTOM_KEY, { initial: { items: [] } })
  const current = ctx.ui.model.current()
  if (current?.providerID === provider.id) {
    ctx.ui.toast.show({ message: "Select another model first", variant: "warning" })
    return
  }
  await update((draft) => {
    draft.items = draft.items.filter((item) => item.id !== provider.id)
  })
  try {
    const { readFile: rf, copyFile: cf, writeFile: wf, rename: rn, unlink: ul, chmod: cm, stat: st } = await import("node:fs/promises")
    const { join: jn } = await import("node:path")
    const { homedir: hd } = await import("node:os")
    const cfgPath = jn(process.env.XDG_CONFIG_HOME || jn(hd(), ".config"), "opencode", "opencode.json")
    const cfgRaw = await rf(cfgPath, "utf8").catch(() => "")
    if (cfgRaw) {
      const cfg = JSON.parse(cfgRaw.replace(/^\uFEFF/, ""))
      if (cfg.provider?.[provider.id]) {
        if (await rf(cfgPath, "utf8") !== cfgRaw) throw new Error("Config changed; retry")
        try {
          await cf(cfgPath, `${cfgPath}.bak-${Date.now()}`)
        } catch {}
        delete cfg.provider[provider.id]
        const tmp = `${cfgPath}.tmp-${Date.now()}`
        try {
          const ending = cfgRaw.includes("\r\n") ? "\r\n" : "\n"
          const prefix = cfgRaw.startsWith("\uFEFF") ? "\uFEFF" : ""
          await wf(tmp, prefix + JSON.stringify(cfg, null, 2).replace(/\n/g, ending) + ending, { encoding: "utf8", flag: "wx", mode: 0o600 })
          try {
            await cm(tmp, (await st(cfgPath)).mode)
          } catch {}
          await rn(tmp, cfgPath)
        } catch (error) {
          await ul(tmp).catch(() => {})
          throw error
        }
      }
    }
  } catch (e) {
    ctx.ui.toast.show({ message: `Storage cleared; config cleanup: ${String((e as Error)?.message ?? e).slice(0, 80)}`, variant: "warning" })
  }
  await refreshProviderModelList(ctx)
  ctx.ui.toast.show({ message: `${provider.name}: deleted. Restart OpenCode if still listed.`, variant: "success" })
}

function QuotaPanel(props: { ctx: Context }) {
  const ctx = props.ctx
  const [panel, updatePanel] = ctx.storage.memory("nine-quota-panel", { initial: { expanded: false } })
  const [nine, updateNine] = ctx.storage.store<NineStore>(NINE_KEY, {
    initial: { baseUrl: "http://127.0.0.1:20128", password: "", quotaAutoRefresh: false },
  })
  const [cache, updateCache] = ctx.storage.memory<{
    entries: Record<string, { accounts: QuotaAccount[]; text: string; updatedAt: number }>
  }>("nine-quota-cache", { initial: { entries: {} } })
  const [quota, updateQuota] = ctx.storage.memory<{
    text: string
    modelID: string
    loading: boolean
    updatedAt: number
    accounts: QuotaAccount[]
  }>("nine-quota-v2", { initial: { text: "No data", modelID: "", loading: false, updatedAt: 0, accounts: [] } })
  let inFlight = false

  const current = () => {
    try {
      return ctx.ui.model.current()
    } catch {
      return undefined
    }
  }

  const refreshQuota = async (force = false) => {
    const sel = current()
    if (!sel) {
      updateQuota((d) => {
        d.text = "Select a model"
        d.modelID = ""
        d.accounts = []
        d.loading = false
      })
      return
    }
    const base = normBase((nine as NineStore).baseUrl || "http://127.0.0.1:20128")
    const modelID = `${base}/${sel.providerID}/${sel.modelID}`
    const saved = cache.entries[modelID]
    if (!force && saved) {
      if (quota.modelID !== modelID || quota.updatedAt !== saved.updatedAt) updateQuota((d) => {
        d.modelID = modelID
        d.accounts = saved.accounts
        d.text = saved.text
        d.updatedAt = saved.updatedAt
        d.loading = false
      })
      if (nine.quotaAutoRefresh !== true || Date.now() - saved.updatedAt < 60_000) return
    }
    if (inFlight) return
    inFlight = true
    updateQuota((d) => {
      d.loading = true
      if (d.modelID !== modelID) {
        d.modelID = modelID
        if (!saved) {
          d.accounts = []
          d.text = "Loading"
        }
      }
    })
    try {
      const headers: Record<string, string> = {}
      let connRes = await fetch(`${base}/api/providers/client?pageSize=500&accountStatus=active`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      })
      if (connRes.status === 401 && (nine as NineStore).password) {
        try {
          const login = await fetch(`${base}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: (nine as NineStore).password }),
            signal: AbortSignal.timeout(10_000),
          })
          const cookie = login.headers.get("set-cookie") ?? ""
          let token = ""
          try {
            const lj: any = await login.clone().json()
            token = lj?.token ?? lj?.accessToken ?? ""
          } catch {}
          if (token) headers.Authorization = `Bearer ${token}`
          if (cookie) headers.Cookie = cookie
          connRes = await fetch(`${base}/api/providers/client?pageSize=500&accountStatus=active`, {
            headers,
            signal: AbortSignal.timeout(10_000),
          })
        } catch {}
      }
      if (!connRes.ok) throw new Error(`providers/client HTTP ${connRes.status}`)
      const cj: any = await connRes.json()
      const conns: any[] = cj?.connections ?? []
      const filtered = activeForProvider(conns, providersForModel(sel.modelID))
      const settled = await Promise.allSettled(
        filtered.map(async (c): Promise<QuotaAccount> => {
          const label = String(c?.displayName ?? c?.name ?? c?.email ?? c?.provider ?? c?.id).slice(0, 24)
          try {
            const u = await fetch(`${base}/api/usage/${c.id}?force=1`, {
              headers,
              signal: AbortSignal.timeout(10_000),
            })
            if (!u.ok)
              return { label, provider: String(c.provider), windows: [], error: `HTTP ${u.status}` }
            const uj: any = await u.json()
            const windows = quotaWindows(uj)
            return {
              label,
              provider: String(c.provider),
              windows,
              error: !windows.length && (uj?.error || uj?.message) ? "Unavailable" : undefined,
            }
          } catch (e) {
            return { label, provider: String(c.provider), windows: [], error: "Unavailable" }
          }
        }),
      )
      const accounts = settled.map((s, i) =>
        s.status === "fulfilled"
          ? s.value
          : { label: String(filtered[i]?.name ?? "Account"), provider: String(filtered[i]?.provider ?? ""), windows: [], error: "Unavailable" },
      )
      const selected = current()
      if (!selected || `${base}/${selected.providerID}/${selected.modelID}` !== modelID) return
      const updatedAt = Date.now()
      const text = accounts.length ? `${accounts.length} accounts` : "No active accounts"
      updateCache((d) => { d.entries[modelID] = { accounts, text, updatedAt } })
      updateQuota((d) => {
        d.loading = false
        d.updatedAt = updatedAt
        d.accounts = accounts
        d.modelID = modelID
        d.text = text
      })
    } catch (e) {
      const selected = current()
      if (!selected || `${base}/${selected.providerID}/${selected.modelID}` !== modelID) return
      const text = String((e as Error)?.message ?? e).includes("401") ? "Sign in required" : "Offline"
      const updatedAt = Date.now()
      if (!saved) updateCache((d) => { d.entries[modelID] = { accounts: [], text, updatedAt } })
      updateQuota((d) => {
        d.loading = false
        d.text = text
        d.updatedAt = updatedAt
        if (d.modelID !== modelID) d.accounts = []
        d.modelID = modelID
      })
    } finally {
      inFlight = false
      const next = current()
      if (next && `${base}/${next.providerID}/${next.modelID}` !== modelID) void refreshQuota()
    }
  }

  createEffect(on(() => {
    const selected = current()
    return selected ? `${normBase(nine.baseUrl)}/${selected.providerID}/${selected.modelID}` : ""
  }, () => { void refreshQuota() }, { defer: true }))

  try {
    onMount(() => {
      const t1 = setTimeout(() => void refreshQuota().catch(() => {}), 1500)
      const timer = setInterval(() => {
        if (nine.quotaAutoRefresh === true && !quota.loading && Date.now() - quota.updatedAt >= 60_000) {
          void refreshQuota().catch(() => {})
        }
      }, 5_000)
      onCleanup(() => {
        clearTimeout(t1)
        clearInterval(timer)
      })
    })
  } catch {}

  const groups = createMemo(() => {
    const byProvider = new Map<string, QuotaAccount[]>()
    for (const account of quota.accounts) {
      const name = account.provider || "Other"
      byProvider.set(name, [...(byProvider.get(name) ?? []), account])
    }
    return [...byProvider].map(([name, accounts]) => ({
      name,
      accounts,
      labelWidth: quotaLabelWidth(accounts.flatMap((account) => account.windows)),
    }))
  })

  return (
    <box flexDirection="column">
      <box onMouseDown={() => updatePanel((draft) => { draft.expanded = !draft.expanded })}>
        <text>{`${panel.expanded ? "▼" : "▶"} Quota`}</text>
      </box>
      <Show when={panel.expanded}>
        <box paddingLeft={2} flexDirection="row">
          <box onMouseDown={() => void updateNine((draft) => { draft.quotaAutoRefresh = draft.quotaAutoRefresh !== true })}>
            <text>{`[${nine.quotaAutoRefresh === true ? "x" : " "}] Auto 60s`}</text>
          </box>
          <box onMouseDown={() => void refreshQuota(true)} paddingLeft={2}>
            <text>{quota.loading ? "Refreshing…" : "Refresh ↻"}</text>
          </box>
        </box>
        <Show when={quota.accounts.length > 0 && (quota.text === "Offline" || quota.text === "Sign in required")}>
          <text>{`  ${quota.text} · showing last result`}</text>
        </Show>
        <Show when={quota.accounts.length > 0} fallback={<text>{`  ${quota.loading ? "Loading" : quota.text}`}</text>}>
          <For each={groups()}>
            {(group) => (
              <box flexDirection="column" paddingLeft={1}>
                <text>{`└ ${group.name}`}</text>
                <For each={group.accounts}>
                  {(account) => (
                    <box flexDirection="column" paddingLeft={2}>
                      <text>{`└ ${account.label}`.slice(0, 32)}</text>
                      <Show when={account.windows.length} fallback={<text>{`  ${account.error || "No quota"}`}</text>}>
                        <For each={account.windows}>
                          {(window) => <text>{quotaRow(window, group.labelWidth)}</text>}
                        </For>
                      </Show>
                    </box>
                  )}
                </For>
              </box>
            )}
          </For>
        </Show>
      </Show>
    </box>
  )
}

function KeymapHost(props: { ctx: Context }) {
  const ctx = props.ctx
  ctx.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
          id: "9router.connect",
          title: "9Router: Connect",
        group: "9Router",
        palette: true,
        slash: { name: "connect", aliases: ["add-provider"] },
        run: async () => {
          try {
            await saveConnection(ctx)
          } catch (e) {
            ctx.ui.toast.show({ message: String((e as Error)?.message ?? e).slice(0, 160), variant: "error" })
          }
        },
      },
      {
        id: "9router.dashboard",
        title: "9Router: Dashboard",
        group: "9Router",
        palette: true,
        slash: { name: "9router-dashboard" },
        run: async () => {
          const [nine, updateNine] = ctx.storage.store(NINE_KEY, {
            initial: { baseUrl: "http://127.0.0.1:20128", password: "" },
          })
          const baseUrl = await ctx.ui.dialog.prompt({
            title: "Dashboard URL",
            value: (nine as NineStore).baseUrl,
          })
          if (baseUrl) await updateNine((d) => void (d.baseUrl = normBase(baseUrl)))
          const password = await ctx.ui.dialog.prompt({
            title: "Dashboard password",
          })
          if (password !== undefined) await updateNine((d) => void (d.password = password))
          ctx.ui.toast.show({ message: "Dashboard saved", variant: "success" })
        },
      },
        {
          id: "9router.reconnect",
          title: "9Router: Reconnect",
          group: "9Router",
          palette: true,
          slash: { name: "reconnect", aliases: ["reconect"] },
          run: async () => {
            try {
              const selected = await chooseCustom(ctx)
              if (selected) await saveConnection(ctx, selected)
            } catch (e) {
              ctx.ui.toast.show({ message: String((e as Error)?.message ?? e).slice(0, 120), variant: "error" })
            }
          },
        },
        {
          id: "9router.connections",
          title: "9Router: Connections",
          group: "9Router",
          palette: true,
          slash: { name: "connections", aliases: ["delete-connect"] },
          run: async () => {
            try {
              await manageConnections(ctx)
            } catch (e) {
              ctx.ui.toast.show({ message: String((e as Error)?.message ?? e).slice(0, 120), variant: "error" })
            }
          },
        },
    ],
  }))
  return null as any
}

export default Plugin.define({
  id: "9router-quota",
  setup(ctx) {
    const disposables: Array<() => void> = []
    try {
      disposables.push(ctx.ui.slot({ append: "sidebar.content", render: () => <QuotaPanel ctx={ctx} /> as any }))
    } catch (e) {
      ctx.ui.toast.show({ message: "Quota slot failed", variant: "warning" })
    }
    try {
      disposables.push(ctx.ui.slot({ append: "app", render: () => <KeymapHost ctx={ctx} /> as any }))
    } catch (e) {
      ctx.ui.toast.show({ message: "Keymap slot failed", variant: "warning" })
    }

    return () => {
      disposables.forEach((d) => {
        try {
          d()
        } catch {}
      })
    }
  },
})
