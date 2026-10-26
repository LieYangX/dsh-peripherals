/**
 * MCP 服务器探活：给「外设」页的连接状态提供真实依据。
 *
 * loader 条目上有没有 fiber 只说明「插件条目挂载成功」，跟远端 MCP 服务进程活没活
 * 毫无关系——服务没起时 fiber 照样在，界面就会误报「已连接」。所以这里按传输方式
 * 各做一次真探测：
 * - `streamable-http`：按 MCP 规范发一次 `initialize` 握手，看有没有合法响应；
 * - `stdio`：子进程由 DSH 客户端托管，这里不重复拉起（会产生副作用），
 *   退回「工具表里已注册的工具数」这个弱信号，探不准就报 `unknown` 而不是硬判。
 *
 * 网络请求用 `node:http` / `node:https` 而不是全局 `fetch`：宿主跑在 Electron
 * 主进程里，全局 fetch 的有无取决于 Electron 版本，而这里要的是稳定的错误码
 * （ECONNREFUSED 之类）和可控的套接字超时。
 */
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { asRecord, asString } from './util.js'

/** 探活超时：页面列表要等它，宁可判失败也别让界面长时间转圈。 */
const PROBE_TIMEOUT_MS = 2000

/** 握手用的 MCP 协议版本；服务端不认会回它支持的版本，不影响连通性判定。 */
const PROBE_PROTOCOL_VERSION = '2025-06-18'

/** 探活客户端标识里的版本号。 */
const PROBE_CLIENT_VERSION = '0.1.0'

/** 首段响应体的字节上限：`initialize` 的结果一定远小于它。 */
const FIRST_CHUNK_LIMIT = 8192

/**
 * 把网络异常翻成一句人话，直接显示在服务器那一行下面。
 *
 * @param error - 请求抛出的异常
 * @returns 面向用户的失败原因
 */
function describeError(error) {
  const code = asString(error?.code)
  if (code === 'ECONNREFUSED') return '连接被拒绝（该端口没有服务在监听）'
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return '域名解析失败'
  if (code === 'ECONNRESET' || code === 'EPIPE') return '连接被对端重置'
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return '目标主机不可达'
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || error?.name === 'TimeoutError') {
    return `握手超时（${PROBE_TIMEOUT_MS}ms 内无响应）`
  }
  if (code.startsWith('ERR_TLS') || code.includes('CERT')) return `证书校验失败（${code}）`
  if (error?.name === 'TypeError') return '地址不合法或请求被拒绝'
  const message = asString(error?.message).trim()
  return message === '' ? '未知网络错误' : message
}

/**
 * 发一次 `initialize` 握手，只取响应头与首段响应体。
 *
 * 读到头就收工并断开，避免服务端用 SSE 长连接把探活拖到超时。
 *
 * @param url - 服务器地址
 * @param headers - 请求头（已过滤成字符串值）
 * @param body - 已序列化的 JSON-RPC 请求体
 * @returns `{ status, text }`
 */
function sendInitialize(url, headers, body) {
  return new Promise((resolve, reject) => {
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      reject(new TypeError('地址不是合法的 URL'))
      return
    }
    const send = parsed.protocol === 'https:' ? httpsRequest : httpRequest
    let settled = false
    const request = send(parsed, {
      method: 'POST',
      headers: { ...headers, 'content-length': Buffer.byteLength(body) },
      timeout: PROBE_TIMEOUT_MS,
    })
    /** 只认第一次结果，随后立刻断开连接释放套接字。 */
    const settle = (finish, value) => {
      if (settled) return
      settled = true
      finish(value)
      request.destroy()
    }
    request.on('timeout', () => {
      settle(reject, Object.assign(new Error('探活超时'), { name: 'TimeoutError', code: 'ETIMEDOUT' }))
    })
    request.on('error', (error) => settle(reject, error))
    request.on('response', (response) => {
      const status = response.statusCode ?? 0
      const chunks = []
      let length = 0
      response.on('data', (chunk) => {
        chunks.push(chunk)
        length += chunk.length
        if (length >= FIRST_CHUNK_LIMIT) settle(resolve, { status, text: Buffer.concat(chunks).toString('utf8') })
      })
      response.on('end', () => settle(resolve, { status, text: Buffer.concat(chunks).toString('utf8') }))
      response.on('error', (error) => settle(reject, error))
    })
    request.end(body)
  })
}

/**
 * 从响应体里读出 JSON-RPC 错误文案（兼容纯 JSON 与 SSE 的 `data:` 行）。
 *
 * @param text - 响应体首段文本
 * @returns 错误文案；不是错误响应时返回 undefined
 */
function jsonRpcError(text) {
  const body = asString(text)
  if (body === '') return undefined
  const line = body.startsWith('{')
    ? body
    : asString(body.split(/\r?\n/).find((item) => item.startsWith('data:')))
      .slice('data:'.length)
      .trim()
  if (line === '') return undefined
  try {
    const message = JSON.parse(line)?.error?.message
    return typeof message === 'string' && message !== '' ? `服务返回错误：${message}` : undefined
  } catch {
    return undefined
  }
}

/**
 * 探测一台 streamable-http 服务器：发一次 `initialize` 握手。
 *
 * @param raw - 该条目的原始 config
 * @returns 探活结果
 */
async function probeHttp(raw) {
  const url = asString(raw.url).trim()
  if (url === '') return { state: 'disconnected', detail: '没有配置服务器地址' }
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
  // 只透传字符串头：表单里尚未解析的 !!js 表达式不能当请求头发出去
  let unresolved = 0
  for (const [key, value] of Object.entries(asRecord(raw.headers))) {
    if (typeof value === 'string') headers[key] = value
    else unresolved += 1
  }
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 'dsh-peripherals-probe',
    method: 'initialize',
    params: {
      protocolVersion: PROBE_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'dsh-peripherals', version: PROBE_CLIENT_VERSION },
    },
  })
  let result
  try {
    result = await sendInitialize(url, headers, body)
  } catch (error) {
    return { state: 'disconnected', detail: describeError(error) }
  }
  if (result.status === 401 || result.status === 403) {
    // 请求头里有没求值的 !!js（比如 token 取自环境变量）时，鉴权失败不能算服务的问题
    if (unresolved > 0) {
      return { state: 'unknown', detail: `鉴权失败，但请求头里有 ${unresolved} 个未求值的 !!js 表达式，探活结果不可信` }
    }
    return { state: 'disconnected', detail: `鉴权失败（HTTP ${result.status}）` }
  }
  const failure = jsonRpcError(result.text)
  if (failure !== undefined) return { state: 'disconnected', detail: failure }
  if (result.status < 200 || result.status >= 300) {
    return { state: 'disconnected', detail: `服务返回 HTTP ${result.status}` }
  }
  return { state: 'connected', detail: `握手成功（HTTP ${result.status}）` }
}

/**
 * 探测一台 stdio 服务器：做不到真探活，只能看工具有没有注册上。
 *
 * @param server - 列表行（含已注册工具）
 * @param raw - 该条目的原始 config
 * @returns 探活结果
 */
function probeStdio(server, raw) {
  if (asString(raw.command).trim() === '') return { state: 'disconnected', detail: '没有配置启动命令' }
  const toolCount = Array.isArray(server.tools) ? server.tools.length : 0
  if (toolCount > 0) return { state: 'connected', detail: `已注册 ${toolCount} 个工具` }
  return { state: 'unknown', detail: 'stdio 进程由 DSH 托管，这里不重复拉起，未探测到已注册工具' }
}

/**
 * 探测一台服务器（已停用的直接返回，不必发请求）。
 *
 * @param server - 列表行，需带 `disabled` / `tools` / `rawConfig`
 * @returns 探活结果
 */
export async function probeServer(server) {
  if (server.disabled === true) {
    return { state: 'disabled', detail: '已在配置里停用', checkedAt: new Date().toISOString() }
  }
  const raw = asRecord(server.rawConfig)
  const health = asString(raw.transport) === 'streamable-http'
    ? await probeHttp(raw)
    : probeStdio(server, raw)
  return { ...health, checkedAt: new Date().toISOString() }
}

/**
 * 并发探测整张列表，就地把 `health` 挂到每一行上。
 *
 * @param servers - 列表行
 * @returns 无
 */
export async function probeServers(servers) {
  await Promise.all(servers.map(async (server) => {
    server.health = await probeServer(server)
  }))
}
