/**
 * MCP 服务器管理：读写 profile patch 里的 `@deepseek-ai/dsh-mcp-client` 条目。
 *
 * - 读：直接扫运行中 loader 的条目，拿到「已经生效」的真实配置；
 * - 改：走官方 configEditor.edit()，保留 YAML 注释、`!!js` 表达式并即时重载；
 * - 增：向 profile patch 追加一个 `- insert:` 块，由 HMR 热加载；
 * - 删：按 id 从 profile patch 里摘掉该条目（独占 insert 块时整块移除）。
 */
import {
  HttpError,
  asRecord,
  asString,
  asStringArray,
  assert,
  decodeValue,
  encodeValue,
  formatPairLines,
  parsePairLines,
  readJsonBody,
  requireMethod,
  requireTrustedPost,
  sendError,
  sendJson,
} from './util.js'
import { probeServers } from './health.js'
import { appendInsertBlock, removeEntryRow, requirePatchPath } from './yaml.js'

/** 提供 MCP 客户端的模块名。 */
export const MCP_PACKAGE = '@deepseek-ai/dsh-mcp-client'

/** serverName 的合法形式（与 dsh-mcp-client 的校验保持一致）。 */
const SERVER_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/

/** 表单能编辑的字段：更新时先清空这些键再按提交值重建，切换传输不会留下旧字段。 */
const EDITABLE_KEYS = [
  'serverName',
  'transport',
  'url',
  'headers',
  'command',
  'args',
  'cwd',
  'env',
  'toolCallTimeoutMs',
  'failOnStartupError',
]

/**
 * 从宿主上下文取本插件需要的服务（缺失时返回 undefined，由各路由自行报错）。
 *
 * @param ctx - 宿主插件上下文
 * @returns 服务集合
 */
function services(ctx) {
  const loader = ctx.get('loader')
  const configEditor = ctx.get('configEditor')
  const profileContext = ctx.get('profileContext')
  const patchPath = configEditor?.documentPath ?? profileContext?.patchPath
  return { loader, configEditor, patchPath }
}

/**
 * 判断 loader 条目是不是 MCP 客户端条目。
 *
 * @param entry - loader 条目
 * @returns 是 MCP 客户端条目时返回 true
 */
function isMcpEntry(entry) {
  const name = entry?.options?.name
  return typeof name === 'string' && /(^|\/)dsh-mcp-client$/.test(name)
}

/**
 * 按条目 id 在运行中 loader 里查找条目。
 *
 * @param loader - loader 服务
 * @param id - 条目 id（`include:corex` 或裸 id）
 * @returns 命中的条目；找不到返回 undefined
 */
function findEntry(loader, id) {
  if (loader === undefined || loader === null) return undefined
  for (const entry of loader.entries()) {
    if (entry.id === id) return entry
    if (entry.options?.id === id) return entry
  }
  return undefined
}

/**
 * 把配置里的传输方式收敛成两个已知值。
 *
 * @param value - 原始值
 * @returns `stdio` 或 `streamable-http`
 */
function transportOf(value) {
  return value === 'streamable-http' ? 'streamable-http' : 'stdio'
}

/**
 * 把原始配置投影成表单可编辑的扁平结构。
 *
 * @param raw - loader 条目里的原始 config
 * @returns 表单结构
 */
function editableOf(raw) {
  const config = asRecord(raw)
  const transport = transportOf(config.transport)
  const view = {
    serverName: asString(config.serverName),
    transport,
  }
  if (transport === 'streamable-http') {
    view.url = asString(config.url)
    view.headers = formatPairLines(encodeValue(asRecord(config.headers)))
  } else {
    view.command = asString(config.command)
    view.args = asStringArray(config.args).join(' ')
    view.cwd = asString(config.cwd)
    view.env = formatPairLines(encodeValue(asRecord(config.env)))
  }
  if (typeof config.toolCallTimeoutMs === 'number') view.toolCallTimeoutMs = config.toolCallTimeoutMs
  view.failOnStartupError = config.failOnStartupError === true
  return view
}

/**
 * 生成列表里的一行摘要（地址或命令）。
 *
 * @param raw - 原始 config
 * @returns 摘要文本
 */
function summaryOf(raw) {
  const config = asRecord(raw)
  if (transportOf(config.transport) === 'streamable-http') return asString(config.url)
  const args = asStringArray(config.args)
  return [asString(config.command), ...args].filter((part) => part !== '').join(' ')
}

/**
 * 读出某台服务器当前注册进工具表的工具（`mcp__<server>__<raw>`）。
 *
 * 这就是「连通性/工具预览」的真实依据：服务器连上并同步完工具后，工具才会
 * 出现在注册表里；停用或断开的服务器这里取到空数组。拿不到 tools 服务时返回
 * `undefined`（未知），页面据此不显示工具信息。
 *
 * @param ctx - 宿主上下文
 * @param serverName - 服务器名（即工具的 namespace）
 * @returns 工具数组；服务不可用时返回 undefined
 */
function toolsOf(ctx, serverName) {
  const tools = ctx.get('tools')
  if (tools === undefined || tools === null || typeof tools.schemas !== 'function') return undefined
  try {
    const prefix = `mcp__${serverName}__`
    return tools
      .schemas()
      .filter((schema) => typeof schema?.name === 'string' && schema.name.startsWith(prefix))
      .map((schema) => ({
        name: schema.name,
        description: typeof schema.description === 'string' ? schema.description : '',
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
  } catch {
    return undefined
  }
}

/**
 * 列出运行中 loader 上的全部 MCP 服务器（附带已注册的工具）。
 *
 * @param ctx - 宿主上下文
 * @returns 服务器数组
 */
export function listServers(ctx) {
  const servers = []
  const loader = ctx.get('loader')
  if (loader === undefined || loader === null) return servers
  for (const entry of loader.entries()) {
    if (!isMcpEntry(entry)) continue
    const raw = asRecord(entry.options?.config)
    const serverName = asString(raw.serverName, asString(entry.options?.id))
    const tools = toolsOf(ctx, serverName)
    servers.push({
      id: entry.id,
      patchId: asString(entry.options?.id),
      serverName,
      transport: transportOf(raw.transport),
      summary: summaryOf(raw),
      active: entry.fiber !== undefined && entry.fiber !== null,
      disabled: Boolean(entry.disabled),
      config: editableOf(raw),
      toolPrefix: `mcp__${serverName}__`,
      tools,
      toolCount: Array.isArray(tools) ? tools.length : undefined,
      // 探活要用原始 config（url / headers / command），序列化前会被 publicServers 摘掉
      rawConfig: raw,
    })
  }
  servers.sort((left, right) => left.serverName.localeCompare(right.serverName))
  return servers
}

/**
 * 校验并合成下一份 MCP 配置。
 *
 * @param submitted - 表单提交的值
 * @param currentRaw - 当前条目的原始 config（新增时传空对象）
 * @returns 下一份原始 config
 */
export function buildConfig(submitted, currentRaw = {}) {
  const next = { ...asRecord(currentRaw) }
  for (const key of EDITABLE_KEYS) delete next[key]
  const serverName = asString(submitted.serverName).trim()
  assert(SERVER_NAME_RE.test(serverName), 'serverName 必填，只能包含字母、数字、下划线和短横线，长度 1-32')
  const transport = transportOf(submitted.transport)
  next.serverName = serverName
  next.transport = transport
  if (transport === 'streamable-http') {
    const url = asString(submitted.url).trim()
    assert(/^https?:\/\//i.test(url), 'HTTP 传输需要填写以 http:// 或 https:// 开头的地址')
    next.url = url
    const headers = parsePairLines(submitted.headers)
    if (headers !== undefined) next.headers = decodeValue(headers)
  } else {
    const command = asString(submitted.command).trim()
    assert(command !== '', 'stdio 传输需要填写启动命令，例如 npx')
    next.command = command
    const args = Array.isArray(submitted.args)
      ? asStringArray(submitted.args)
      : asString(submitted.args).split(/\s+/).filter((part) => part !== '')
    if (args.length > 0) next.args = args
    const cwd = asString(submitted.cwd).trim()
    if (cwd !== '') next.cwd = cwd
    const env = parsePairLines(submitted.env)
    if (env !== undefined) next.env = decodeValue(env)
  }
  if (typeof submitted.toolCallTimeoutMs === 'number' && Number.isFinite(submitted.toolCallTimeoutMs) && submitted.toolCallTimeoutMs > 0) {
    next.toolCallTimeoutMs = Math.round(submitted.toolCallTimeoutMs)
  }
  if (typeof submitted.failOnStartupError === 'boolean') next.failOnStartupError = submitted.failOnStartupError
  return next
}

/**
 * 由 serverName 生成稳定、可读的条目 id。
 *
 * @param serverName - 服务器名
 * @returns 条目 id
 */
export function entryIdOf(serverName) {
  const slug = serverName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return `mcp-${slug === '' ? 'server' : slug}`
}

/**
 * 保存（新增或更新）一台 MCP 服务器。
 *
 * @param ctx - 宿主上下文
 * @param body - 请求体：`{ id?, config }`
 * @returns 处理结果
 */
async function saveServer(ctx, body) {
  const { loader, configEditor, patchPath } = services(ctx)
  assert(loader !== undefined && loader !== null, '宿主 loader 服务不可用', 500)
  const submitted = asRecord(body.config)
  const id = asString(body.id).trim()

  // 更新：走官方 configEditor，配置写入 profile patch 并即时应用到运行中的条目
  if (id !== '') {
    assert(configEditor !== undefined && configEditor !== null, '宿主 configEditor 服务不可用，无法保存到 profile patch', 500)
    const entry = findEntry(loader, id)
    assert(entry !== undefined, `找不到 MCP 条目 ${id}`, 404)
    const next = buildConfig(submitted, entry.options?.config)
    const conflict = listServers(ctx).find((server) => server.serverName === next.serverName && server.id !== entry.id)
    assert(conflict === undefined, `serverName "${next.serverName}" 已被 ${conflict?.patchId ?? ''} 使用`, 409)
    await configEditor.edit(entry, () => next)
    return { ok: true, mode: 'updated', id: entry.id }
  }

  // 新增：向 profile patch 追加 insert 块，HMR 会把它热加载起来
  const next = buildConfig(submitted, {})
  const conflict = listServers(ctx).find((server) => server.serverName === next.serverName)
  assert(conflict === undefined, `serverName "${next.serverName}" 已被 ${conflict?.patchId ?? ''} 使用`, 409)
  const patch = requirePatchPath(patchPath)
  const entryId = entryIdOf(next.serverName)
  const result = appendInsertBlock(patch, entryId, MCP_PACKAGE, next)
  return { ok: true, mode: 'created', id: entryId, backup: result.backup }
}

/**
 * 删除一台 MCP 服务器（从 profile patch 里摘掉对应条目）。
 *
 * @param ctx - 宿主上下文
 * @param body - 请求体：`{ id }`
 * @returns 处理结果
 */
async function deleteServer(ctx, body) {
  const { loader, patchPath } = services(ctx)
  const id = asString(body.id).trim()
  assert(id !== '', '缺少条目 id')
  const patch = requirePatchPath(patchPath)
  const entry = findEntry(loader, id)
  const patchId = asString(entry?.options?.id, id.split(':').pop() ?? id)
  const result = removeEntryRow(patch, patchId)
  return { ok: true, id, patchId, backup: result.backup }
}

/**
 * 列表接口会带出去的行：去掉只给探活用的内部字段（url / headers 之类
 * 已经从 `config` 里给过表单了，原始值不必再暴露一遍）。
 *
 * @param servers - `listServers` 的结果
 * @returns 可直接序列化的行
 */
export function publicServers(servers) {
  return servers.map((server) => {
    const row = { ...server }
    delete row.rawConfig
    return row
  })
}

/**
 * 挂载 MCP 管理路由。
 *
 * @param host - 注入了 webServer 的宿主上下文
 * @returns 释放函数
 */
export function mountMcpRoutes(host) {
  const webServer = host.webServer
  const disposers = []

  /**
   * 统一兜住异常：把错误翻成 `{ error }` JSON。
   *
   * @param handler - 业务处理函数
   * @returns 包装后的 HTTP 处理函数
   */
  const guard = (handler) => async (request, response) => {
    try {
      await handler(request, response)
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500
      const message = error instanceof Error ? error.message : String(error)
      sendError(response, status, message)
    }
  }

  disposers.push(webServer.register({
    kind: 'exact',
    path: '/dsh-mcp-skill/mcp',
    handler: guard(async (request, response) => {
      if (!requireMethod(request, response, 'GET')) return
      const { loader, patchPath } = services(host)
      // 连接状态必须是真探活结果：fiber 在只说明条目挂上了，说明不了远端还活着
      const servers = listServers(host)
      await probeServers(servers)
      sendJson(response, 200, {
        ready: loader !== undefined && loader !== null,
        patchPath: asString(patchPath),
        servers: publicServers(servers),
      })
    }),
  }))

  disposers.push(webServer.register({
    kind: 'exact',
    path: '/dsh-mcp-skill/mcp/save',
    handler: guard(async (request, response) => {
      if (!requireTrustedPost(request, response)) return
      const body = asRecord(await readJsonBody(request))
      sendJson(response, 200, await saveServer(host, body))
    }),
  }))

  disposers.push(webServer.register({
    kind: 'exact',
    path: '/dsh-mcp-skill/mcp/delete',
    handler: guard(async (request, response) => {
      if (!requireTrustedPost(request, response)) return
      const body = asRecord(await readJsonBody(request))
      sendJson(response, 200, await deleteServer(host, body))
    }),
  }))

  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // 释放阶段的异常不影响其余路由卸载
      }
    }
  }
}
