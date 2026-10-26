/**
 * HTTP / JSON 小工具：本项目所有路由共用。
 *
 * 只依赖 node:http 的入参与出参，不引用任何宿主内部模块，
 * 因此插件可以装在 profile 的 node_modules 里独立运行。
 */

/** 请求体上限：MCP 配置与技能文件都很小，超限直接拒绝。 */
export const BODY_LIMIT_BYTES = 512 * 1024

/** 回环主机名：三个别名指向同一台机器，按同一来源比较。 */
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * 把 `host[:port]` 形式的 authority 归一化成 `loopback:端口`。
 *
 * @param authority - 请求头里的 host 原样值
 * @returns 归一化后的来源标识；非回环或无法解析时返回 null
 */
function loopbackAuthority(authority) {
  try {
    const parsed = new URL(`http://${authority}`)
    if (!LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase())) return null
    return `loopback:${parsed.port === '' ? '80' : parsed.port}`
  } catch {
    return null
  }
}

/**
 * 判断请求是否来自本机回环页面（同源写操作的 CSRF 防线）。
 *
 * @param request - 原始 HTTP 请求
 * @returns 同源时返回 true
 */
export function isSameOrigin(request) {
  const host = request.headers.host
  const hostKey = host === undefined ? null : loopbackAuthority(host)
  if (hostKey === null) return false
  const origin = request.headers.origin
  // 没有 Origin 的请求不是浏览器跨站发起的（curl / 同源导航），放行
  if (origin === undefined || origin === '') return true
  try {
    const parsed = new URL(origin)
    // 桌面壳的页面跑在宿主自定义协议下（Origin 形如 dsh-app://app），与 Host 必然不等。
    // 该协议只有宿主自身能产生，外部网页无法伪造，放行不扩大 CSRF 面。
    if (parsed.protocol === 'dsh-app:') return true
    const originKey = loopbackAuthority(parsed.host)
    if (originKey === null) return false
    return originKey === hostKey
  } catch {
    return false
  }
}

/**
 * 写出 JSON 响应。
 *
 * @param response - HTTP 响应对象
 * @param status - 状态码
 * @param value - 任意可序列化值
 */
export function sendJson(response, status, value) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(value))
}

/**
 * 写出错误响应，统一成 `{ error }` 形态。
 *
 * @param response - HTTP 响应对象
 * @param status - 状态码
 * @param message - 面向用户的错误文案
 */
export function sendError(response, status, message) {
  sendJson(response, status, { error: message })
}

/**
 * 校验请求方法，不匹配时回 405 并返回 false。
 *
 * @param request - HTTP 请求
 * @param response - HTTP 响应
 * @param method - 允许的方法
 * @returns 方法匹配时返回 true
 */
export function requireMethod(request, response, method) {
  if (request.method === method) return true
  response.writeHead(405, { allow: method })
  response.end()
  return false
}

/**
 * 校验写操作：必须是 POST，且来自本机同源页面。
 *
 * @param request - HTTP 请求
 * @param response - HTTP 响应
 * @returns 通过校验时返回 true
 */
export function requireTrustedPost(request, response) {
  if (!requireMethod(request, response, 'POST')) return false
  if (isSameOrigin(request)) return true
  sendError(response, 403, '拒绝非本机同源请求')
  return false
}

/**
 * 读取并解析 JSON 请求体。
 *
 * @param request - HTTP 请求
 * @returns 解析后的值
 */
export async function readJsonBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > BODY_LIMIT_BYTES) throw new HttpError(413, '请求体过大')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, '请求体不是合法 JSON')
  }
}

/** 带状态码的错误：路由统一按它回状态。 */
export class HttpError extends Error {
  /**
   * @param status - HTTP 状态码
   * @param message - 面向用户的错误文案
   */
  constructor(status, message) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

/**
 * 断言条件成立，否则抛出带状态码的错误。
 *
 * @param condition - 断言条件
 * @param message - 失败文案
 * @param status - 失败状态码
 */
export function assert(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message)
}

/**
 * 把值收敛成普通对象（数组与 null 视为空对象）。
 *
 * @param value - 任意值
 * @returns 普通对象
 */
export function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
}

/**
 * 把值收敛成字符串。
 *
 * @param value - 任意值
 * @param fallback - 非字符串时的回退值
 * @returns 字符串
 */
export function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

/**
 * 把值收敛成字符串数组（过滤非字符串项）。
 *
 * @param value - 任意值
 * @returns 字符串数组
 */
export function asStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string')
}

/**
 * 把字符串/字符串数组/普通对象里的值编码为「可编辑文本」。
 *
 * 宿主 loader 会把 `!!js` 表达式解析成 `{ __jsExpr }` 对象，
 * 这里统一编码成 `!!js <表达式>` 字符串，表单里就能原样编辑。
 *
 * @param value - 配置里的原始值
 * @returns 编码后的值
 */
export function encodeValue(value) {
  if (typeof value === 'object' && value !== null && typeof value.__jsExpr === 'string') {
    return `!!js ${value.__jsExpr}`
  }
  if (Array.isArray(value)) return value.map((item) => encodeValue(item))
  if (typeof value === 'object' && value !== null) {
    const out = {}
    for (const [key, item] of Object.entries(value)) out[key] = encodeValue(item)
    return out
  }
  return value
}

/**
 * 把表单文本还原成 loader 认识的 `!!js` 表达式对象。
 *
 * @param value - 编码后的值
 * @returns 还原后的配置值
 */
export function decodeValue(value) {
  if (typeof value === 'string' && value.startsWith('!!js ')) {
    return { __jsExpr: value.slice('!!js '.length).trim() }
  }
  if (Array.isArray(value)) return value.map((item) => decodeValue(item))
  if (typeof value === 'object' && value !== null) {
    const out = {}
    for (const [key, item] of Object.entries(value)) out[key] = decodeValue(item)
    return out
  }
  return value
}

/**
 * 把 `KEY=VALUE` / `Name: VALUE` 多行文本解析成对象。
 *
 * 分隔符取第一个 `=` 或 `:`，值里可以再出现分隔符（URL、Bearer token 都能用）。
 *
 * @param text - 多行文本
 * @returns 解析出的键值对象；没有任何有效行时返回 undefined
 */
export function parsePairLines(text) {
  const out = {}
  for (const line of asString(text).split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    const colon = trimmed.indexOf(':')
    let cut = -1
    if (eq < 0) cut = colon
    else if (colon < 0) cut = eq
    else cut = Math.min(eq, colon)
    if (cut <= 0) continue
    const key = trimmed.slice(0, cut).trim()
    const value = trimmed.slice(cut + 1).trim()
    if (key === '') continue
    out[key] = value
  }
  return Object.keys(out).length === 0 ? undefined : out
}

/**
 * 把对象渲染成 `KEY=VALUE` 多行文本（表单回填用）。
 *
 * @param value - 键值对象
 * @returns 多行文本
 */
export function formatPairLines(value) {
  const record = asRecord(value)
  return Object.entries(record)
    .map(([key, item]) => `${key}=${typeof item === 'string' ? item : JSON.stringify(item)}`)
    .join('\n')
}
