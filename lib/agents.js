/**
 * AGENTS.md 管理：列出 DSH 真正会加载的指令文件，并就地创建 / 编辑 / 删除。
 *
 * 加载规则对齐 `@deepseek-ai/dsh-agent-instructions`：
 * 先用户全局 `$DSH_HOME/AGENTS.md`，再从项目根（默认以 `.git` 为标记）到
 * 会话工作目录，逐层读取 `AGENTS.md` / `CLAUDE.md`（基础）与
 * `AGENTS.local.md` / `CLAUDE.local.md`（本地 overlay）。同一目录里内容相同的
 * 兄弟文件只渲染一次，渲染总量受 `maxBytes` 预算限制。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { dshHome } from './yaml.js'
import {
  asRecord,
  asString,
  assert,
  readJsonBody,
  requireMethod,
  requireTrustedPost,
  sendJson,
} from './util.js'

/** 基础候选文件名（与 dsh-agent-instructions 默认值一致）。 */
const BASE_CANDIDATES = ['AGENTS.md', 'CLAUDE.md']

/** 叠加在基础文件之后的本地候选文件名。 */
const LOCAL_CANDIDATES = ['AGENTS.local.md', 'CLAUDE.local.md']

/** 标记项目根的目录项。 */
const ROOT_MARKERS = ['.git']

/** 单个指令文件的读写上上限（默认 maxSourceBytes 为 1 MB）。 */
const FILE_LIMIT_BYTES = 1024 * 1024

/** 拿不到宿主配置时的渲染预算。 */
const DEFAULT_MAX_BYTES = 65536

/** 路由前缀。 */
const ROUTE_PREFIX = '/dsh-mcp-skill/agents'

/**
 * 当前生效的渲染预算：读 agent-instructions 条目的配置，读不到用默认值。
 *
 * @param ctx - 宿主上下文
 * @returns 字节预算
 */
function maxBytesOf(ctx) {
  try {
    const loader = ctx.get('loader')
    if (loader === undefined || loader === null) return DEFAULT_MAX_BYTES
    for (const entry of loader.entries()) {
      const name = asString(entry?.options?.name)
      if (!name.endsWith('dsh-agent-instructions')) continue
      const configured = asRecord(entry.options?.config).maxBytes
      if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) return configured
    }
  } catch {
    // 读不到就用默认预算，页面只做展示用途
  }
  return DEFAULT_MAX_BYTES
}

/**
 * 从起始目录向上找项目根（命中任一标记即认为是根）。
 *
 * @param start - 起始目录
 * @param markers - 标记目录项
 * @returns 项目根绝对路径；找不到时返回起始目录
 */
function findProjectRoot(start, markers = ROOT_MARKERS) {
  const origin = resolve(start)
  let dir = origin
  for (let depth = 0; depth < 64; depth++) {
    for (const marker of markers) {
      if (existsSync(join(dir, marker))) return dir
    }
    const parent = dirname(dir)
    if (parent === dir) return origin
    dir = parent
  }
  return origin
}

/**
 * 列出从项目根到工作目录的目录链（含两端，root 在前）。
 *
 * @param root - 项目根
 * @param target - 工作目录
 * @returns 目录数组
 */
function chainDirs(root, target) {
  const stop = resolve(root)
  const end = resolve(target)
  const dirs = []
  let current = end
  for (let depth = 0; depth < 64; depth++) {
    dirs.push(current)
    if (current === stop) break
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  dirs.reverse()
  // 项目根不是工作目录祖先（换盘等）：只保留根与工作目录两段
  if (dirs[0] !== stop) return [{ dir: stop, role: 'root' }, { dir: end, role: 'cwd' }]
  return dirs.map((dir) => ({
    dir,
    // root 与 cwd 重合时按「工作目录」标注：那正是会话真正读取指令的目录
    role: dir === end ? 'cwd' : dir === stop ? 'root' : 'ancestor',
  }))
}

/**
 * 读取一个文件的展示信息。
 *
 * @param path - 文件路径
 * @returns `{ exists, bytes, mtime }`
 */
function fileInfo(path) {
  try {
    const info = statSync(path)
    if (!info.isFile()) return { exists: false, bytes: 0, mtime: 0 }
    return { exists: true, bytes: info.size, mtime: info.mtimeMs }
  } catch {
    return { exists: false, bytes: 0, mtime: 0 }
  }
}

/**
 * 描述一个候选文件槽位。
 *
 * @param dir - 所在目录
 * @param name - 文件名
 * @param kind - `base` 或 `local`
 * @returns 槽位信息
 */
function candidateSlot(dir, name, kind) {
  const path = join(dir, name)
  const info = fileInfo(path)
  return { name, path, kind, exists: info.exists, bytes: info.bytes, mtime: info.mtime }
}

/**
 * 计算 AGENTS.md 模型（只读）。
 *
 * @param ctx - 宿主上下文
 * @returns 模型
 */
export function buildModel(ctx) {
  const home = join(dshHome(), 'AGENTS.md')
  const globalInfo = fileInfo(home)
  const registry = ctx.get('workspaceRegistry')
  let workspaces = []
  try {
    workspaces = registry === undefined || registry === null ? [] : registry.list()
  } catch {
    workspaces = []
  }
  const model = {
    home: dshHome(),
    maxBytes: maxBytesOf(ctx),
    sourceBytes: FILE_LIMIT_BYTES,
    baseCandidates: BASE_CANDIDATES,
    localCandidates: LOCAL_CANDIDATES,
    global: {
      name: 'AGENTS.md',
      path: home,
      kind: 'global',
      exists: globalInfo.exists,
      bytes: globalInfo.bytes,
      mtime: globalInfo.mtime,
    },
    workspaces: [],
  }
  for (const workspace of workspaces) {
    const workspacePath = resolve(asString(workspace.path))
    const exists = existsSync(workspacePath)
    const projectRoot = findProjectRoot(workspacePath)
    const chain = exists ? chainDirs(projectRoot, workspacePath) : [{ dir: projectRoot, role: 'root' }, { dir: workspacePath, role: 'cwd' }]
    const dirs = []
    for (const link of chain) {
      const files = [
        ...BASE_CANDIDATES.map((name) => candidateSlot(link.dir, name, 'base')),
        ...LOCAL_CANDIDATES.map((name) => candidateSlot(link.dir, name, 'local')),
      ]
      // 空目录只在「项目根」和「工作目录」两处保留一个新建入口，避免整条祖先链噪音
      const hasAny = files.some((file) => file.exists)
      if (!hasAny && link.role === 'ancestor') continue
      dirs.push({ dir: link.dir, role: link.role, files })
    }
    model.workspaces.push({
      id: asString(workspace.id),
      title: asString(workspace.title, basename(workspacePath)),
      path: workspacePath,
      projectRoot,
      exists,
      dirs,
    })
  }
  return model
}

/**
 * 汇总模型里允许读写的文件路径（写操作只认这些槽位）。
 *
 * @param model - 模型
 * @returns `{ files: Set<string>, dirs: Set<string> }`
 */
function allowedPaths(model) {
  const files = new Set()
  const dirs = new Set()
  files.add(resolve(model.global.path).toLowerCase())
  dirs.add(resolve(dirname(model.global.path)).toLowerCase())
  for (const workspace of model.workspaces) {
    for (const link of workspace.dirs) {
      const dir = resolve(link.dir)
      dirs.add(dir.toLowerCase())
      for (const file of link.files) files.add(resolve(file.path).toLowerCase())
    }
  }
  return { files, dirs }
}

/**
 * 校验一个路径是模型里的指令文件槽位。
 *
 * @param model - 模型
 * @param path - 待校验路径
 * @returns 规范化后的绝对路径
 */
function requireSlot(model, path) {
  const target = resolve(asString(path).trim() === '' ? '.' : asString(path).trim())
  const { files } = allowedPaths(model)
  assert(files.has(target.toLowerCase()), '只允许管理 DSH 会加载的 AGENTS.md / CLAUDE.md 文件', 403)
  return target
}

/**
 * 读取一个指令文件。
 *
 * @param ctx - 宿主上下文
 * @param query - URL 查询参数
 * @returns `{ path, exists, content }`
 */
export function readInstruction(ctx, query) {
  const model = buildModel(ctx)
  const target = requireSlot(model, query.get('path'))
  const info = fileInfo(target)
  if (!info.exists) return { path: target, exists: false, content: '' }
  assert(info.bytes <= FILE_LIMIT_BYTES, `文件超过 ${Math.round(FILE_LIMIT_BYTES / 1024)} KB，无法在设置里编辑`)
  return { path: target, exists: true, content: readFileSync(target, 'utf8') }
}

/**
 * 写入（新建或覆盖）一个指令文件。
 *
 * @param ctx - 宿主上下文
 * @param body - 请求体：`{ path, content }`
 * @returns `{ path, mode }`
 */
export function saveInstruction(ctx, body) {
  const model = buildModel(ctx)
  const target = requireSlot(model, body.path)
  const content = asString(body.content)
  assert(content.length <= FILE_LIMIT_BYTES, `内容超过 ${Math.round(FILE_LIMIT_BYTES / 1024)} KB，无法保存`)
  const existed = existsSync(target)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf8')
  return { path: target, mode: existed ? 'updated' : 'created' }
}

/**
 * 删除一个指令文件（移入回收站，不直接抹掉）。
 *
 * @param ctx - 宿主上下文
 * @param body - 请求体：`{ path }`
 * @returns `{ path, movedTo }`
 */
export function deleteInstruction(ctx, body) {
  const model = buildModel(ctx)
  const target = requireSlot(model, body.path)
  assert(existsSync(target), `文件不存在：${target}`, 404)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const trashDir = join(dshHome(), 'dsh-peripherals', 'trash', stamp)
  mkdirSync(trashDir, { recursive: true })
  const movedTo = join(trashDir, basename(target))
  try {
    renameSync(target, movedTo)
  } catch {
    cpSync(target, movedTo)
    rmSync(target, { force: true })
  }
  return { path: target, movedTo }
}

/**
 * 在系统文件管理器里定位一个指令文件。
 *
 * @param ctx - 宿主上下文
 * @param body - 请求体：`{ path }`
 * @returns `{ path }`
 */
export function revealInstruction(ctx, body) {
  const model = buildModel(ctx)
  const target = requireSlot(model, body.path)
  assert(existsSync(target), `文件不存在：${target}`, 404)
  const platform = process.platform
  const child = platform === 'win32'
    ? spawn('explorer.exe', [`/select,${target}`], { detached: true, stdio: 'ignore' })
    : platform === 'darwin'
      ? spawn('open', ['-R', target], { detached: true, stdio: 'ignore' })
      : spawn('xdg-open', [dirname(target)], { detached: true, stdio: 'ignore' })
  child.on('error', () => {})
  child.unref()
  return { path: target }
}

/**
 * 挂载 AGENTS.md 管理路由。
 *
 * @param host - 注入了 webServer 的宿主上下文
 * @returns 释放函数
 */
export function mountAgentRoutes(host) {
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
      const status = typeof error?.status === 'number' ? error.status : 500
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    }
  }

  disposers.push(webServer.register({
    kind: 'exact',
    path: ROUTE_PREFIX,
    handler: guard(async (request, response) => {
      if (!requireMethod(request, response, 'GET')) return
      sendJson(response, 200, buildModel(host))
    }),
  }))

  disposers.push(webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/read`,
    handler: guard(async (request, response) => {
      if (!requireMethod(request, response, 'GET')) return
      const url = new URL(request.url ?? '/', 'http://localhost')
      sendJson(response, 200, readInstruction(host, url.searchParams))
    }),
  }))

  disposers.push(webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/save`,
    handler: guard(async (request, response) => {
      if (!requireTrustedPost(request, response)) return
      sendJson(response, 200, saveInstruction(host, asRecord(await readJsonBody(request))))
    }),
  }))

  disposers.push(webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/delete`,
    handler: guard(async (request, response) => {
      if (!requireTrustedPost(request, response)) return
      sendJson(response, 200, deleteInstruction(host, asRecord(await readJsonBody(request))))
    }),
  }))

  disposers.push(webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/reveal`,
    handler: guard(async (request, response) => {
      if (!requireTrustedPost(request, response)) return
      sendJson(response, 200, revealInstruction(host, asRecord(await readJsonBody(request))))
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
