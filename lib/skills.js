/**
 * 技能（Skill）管理：扫描 DSH 认的本地技能根目录，读取 / 新建 / 编辑 / 删除。
 *
 * 根目录与优先级对齐 `@deepseek-ai/dsh-skill-filesystem`：
 * 项目 `.dsh/skills`(100) → 项目 `.agents/skills`(200) → 用户
 * `$DSH_HOME/skills`(400) → 用户 `~/.agents/skills`(500)。
 * 技能既可以是目录 bundle（`<name>/SKILL.md`），也可以是平铺文件
 * （`<name>.md`）；改动由宿主的文件监视器热更新，无需重启。
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
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

/** 单个技能文件的大小上限（读取 / 保存都按它把关）。 */
const SKILL_FILE_LIMIT_BYTES = 512 * 1024

/** 技能名规则：kebab-case。 */
const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** 默认的技能同步来源（cc-switch 的技能目录）。 */
const DEFAULT_SYNC_SOURCE = join(homedir(), '.cc-switch', 'skills')

/**
 * 共享 agent 配置根目录。
 *
 * @returns 绝对路径
 */
function agentsHome() {
  const fromEnv = process.env.DSH_AGENTS_HOME
  return fromEnv !== undefined && fromEnv !== '' ? fromEnv : join(homedir(), '.agents')
}

/**
 * 找最近的包含 `.git` 的祖先目录，作为「项目根」。
 *
 * 宿主进程的工作目录不一定是用户的代码目录（桌面端通常是 profile 目录），
 * 所以只有真的找到 `.git` 才认它，否则返回 null —— 宁可不显示项目技能根，
 * 也不给出一个假的项目路径。
 *
 * @param start - 起始目录
 * @returns 项目根绝对路径；找不到时返回 null
 */
function findProjectRoot(start) {
  let dir = resolve(start)
  for (let depth = 0; depth < 64; depth++) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

/**
 * 当前环境的技能根目录清单（rank 越小优先级越高）。
 *
 * 没有项目根时只返回用户级的两条根目录。
 *
 * @returns 根目录数组
 */
export function skillRoots() {
  const projectRoot = findProjectRoot(process.cwd())
  const roots = []
  if (projectRoot !== null) {
    roots.push({ id: 'project-dsh', label: '项目 .dsh/skills', scope: 'project', rank: 100, dir: join(projectRoot, '.dsh', 'skills') })
    roots.push({ id: 'project-agents', label: '项目 .agents/skills', scope: 'project', rank: 200, dir: join(projectRoot, '.agents', 'skills') })
  }
  roots.push({ id: 'user-dsh', label: '用户 ~/.dsh/skills', scope: 'user', rank: 400, dir: join(dshHome(), 'skills'), primary: true })
  roots.push({ id: 'user-agents', label: '用户 ~/.agents/skills', scope: 'user', rank: 500, dir: join(agentsHome(), 'skills') })
  return roots
}

/**
 * 去掉值两侧的引号。
 *
 * @param value - 原始值
 * @returns 去引号后的值
 */
function unquote(value) {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * 解析 `true/false/yes/no/on/off/1/0`。
 *
 * @param value - 原始值
 * @returns 布尔值；无法识别时返回 undefined
 */
function parseBoolean(value) {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (['true', 'yes', 'on', '1'].includes(normalized)) return true
  if (['false', 'no', 'off', '0'].includes(normalized)) return false
  return undefined
}

/**
 * 解析 SKILL.md 的 YAML frontmatter（够用即可：单行键值与简单块标量）。
 *
 * @param text - 文件全文
 * @returns `{ data, ok, reason }`
 */
export function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { data: {}, ok: false, reason: '缺少 YAML frontmatter（文件需以 --- 开头）' }
  const rest = text.slice(3)
  const close = /\r?\n---\s*(?:\r?\n|$)/.exec(rest)
  if (close === null) return { data: {}, ok: false, reason: 'frontmatter 缺少闭合的 ---' }
  const block = rest.slice(0, close.index)
  const lines = block.split(/\r?\n/)
  const data = {}
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const matched = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (matched === null) continue
    const key = matched[1]
    let value = matched[2]
    // 块标量（`>` / `|`）把后续缩进行并成一行文本
    if (/^[>|][+-]?$/.test(value.trim())) {
      const folded = []
      for (let next = index + 1; next < lines.length; next++) {
        const child = lines[next]
        if (child.trim() === '') continue
        if (child.length === child.trimStart().length) break
        folded.push(child.trim())
        index = next
      }
      value = folded.join(' ')
    }
    data[key] = unquote(value)
  }
  return { data, ok: true }
}

/**
 * 安全读取文本文件。
 *
 * @param path - 文件路径
 * @returns 文件文本；失败时返回 ''
 */
function safeRead(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

/**
 * 判定一个目录项的真实类型（符号链接 / 目录联接按其指向判定）。
 *
 * 与 `dsh-skill-filesystem` 的 `nodeEntryKind` 保持一致：Windows 的目录联接
 * 在 dirent 上是 `isSymbolicLink()`，必须再 stat 一次才知道它其实是目录。
 *
 * @param full - 完整路径
 * @param entry - readdir 的 Dirent
 * @returns "directory" | "file" | undefined
 */
function direntKind(full, entry) {
  if (entry.isDirectory()) return 'directory'
  if (entry.isFile()) return 'file'
  if (!entry.isSymbolicLink()) return undefined
  try {
    const info = statSync(full)
    if (info.isDirectory()) return 'directory'
    if (info.isFile()) return 'file'
  } catch {
    return undefined
  }
  return undefined
}

/**
 * 路径是否是指向别处的链接（符号链接 / 目录联接）。
 *
 * @param path - 待检查的路径
 * @returns 是链接时返回 true
 */
function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * 读取一个技能文件并投影成列表项。
 *
 * @param root - 所属根目录
 * @param filePath - SKILL.md 或平铺 md 的绝对路径
 * @param kind - `bundle` 或 `file`
 * @param dirPath - bundle 目录（平铺文件时与 filePath 相同）
 * @returns 技能列表项
 */
function readSkill(root, filePath, kind, dirPath) {
  const text = safeRead(filePath)
  const frontmatter = parseFrontmatter(text)
  const fallbackName = kind === 'bundle' ? basename(dirPath) : basename(filePath, '.md')
  const name = asString(frontmatter.data.name) !== '' ? asString(frontmatter.data.name) : fallbackName
  const description = asString(frontmatter.data.description)
  const problems = []
  if (!frontmatter.ok) problems.push(frontmatter.reason)
  if (!SKILL_NAME_RE.test(name)) problems.push('name 需为 kebab-case（小写字母、数字、短横线）')
  if (description === '') problems.push('缺少 description')
  const modelInvocable = parseBoolean(frontmatter.data['disable-model-invocation']) !== true
  const userInvocable = parseBoolean(frontmatter.data['user-invocable']) !== false
  let mtime = 0
  try {
    mtime = statSync(filePath).mtimeMs
  } catch {
    mtime = 0
  }
  // 软连接的技能：编辑会直接改到源目录，页面据此给出提示
  const linkedTo = kind === 'bundle' && isLink(dirPath) ? realPathOf(dirPath) : undefined
  return {
    id: filePath,
    name,
    description,
    whenToUse: asString(frontmatter.data.whenToUse ?? frontmatter.data['when-to-use']),
    source: root.id,
    sourceLabel: root.label,
    scope: root.scope,
    rank: root.rank,
    kind,
    path: filePath,
    dirPath,
    mtime,
    linked: linkedTo !== undefined,
    linkedTo: linkedTo ?? '',
    modelInvocable,
    userInvocable,
    valid: problems.length === 0,
    problems,
  }
}

/**
 * 解析路径的真实位置（跟随链接）。
 *
 * @param path - 路径
 * @returns 真实路径；解析失败时返回原路径
 */
function realPathOf(path) {
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}

/**
 * 扫描所有根目录，列出技能。
 *
 * @returns `{ roots, skills }`
 */
export function listSkills() {
  const roots = skillRoots().map((root) => ({ ...root, exists: existsSync(root.dir) }))
  const skills = []
  for (const root of roots) {
    if (!root.exists) continue
    let entries = []
    try {
      entries = readdirSync(root.dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      // 宿主同样跳过用户根下的 .system 目录
      if (entry.name.startsWith('.')) continue
      const full = join(root.dir, entry.name)
      const kind = direntKind(full, entry)
      if (kind === 'directory') {
        const skillFile = join(full, 'SKILL.md')
        if (!existsSync(skillFile)) continue
        skills.push(readSkill(root, skillFile, 'bundle', full))
      } else if (kind === 'file' && entry.name.toLowerCase().endsWith('.md')) {
        skills.push(readSkill(root, full, 'file', full))
      }
    }
  }
  skills.sort((left, right) => left.rank - right.rank || left.name.localeCompare(right.name))
  // 同名技能按 rank 取第一个生效（后面的被遮蔽）
  const seen = new Set()
  for (const skill of skills) {
    if (seen.has(skill.name)) {
      skill.effective = false
    } else {
      seen.add(skill.name)
      skill.effective = true
    }
  }
  return { roots, skills }
}

/**
 * 判断目标路径是否落在某个技能根目录内。
 *
 * @param target - 待检查的绝对路径
 * @returns 命中的根目录；不在任何根目录内时返回 null
 */
function rootOf(target) {
  const resolved = resolve(target)
  for (const root of skillRoots()) {
    const base = resolve(root.dir)
    if (resolved === base) return root
    const prefix = base.endsWith(sep) ? base : base + sep
    if (resolved.toLowerCase().startsWith(prefix.toLowerCase())) return root
  }
  return null
}

/**
 * 把路径移动到 `$DSH_HOME/dsh-peripherals/trash/<时间戳>/`。
 *
 * @param source - 源路径（目录或文件）
 * @returns 目标路径
 */
function moveToTrash(source) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = join(dshHome(), 'dsh-peripherals', 'trash', stamp)
  mkdirSync(dir, { recursive: true })
  const target = join(dir, basename(source))
  try {
    renameSync(source, target)
  } catch {
    // 跨盘符时 rename 会失败，退化成「复制后删除」
    cpSync(source, target, { recursive: true })
    rmSync(source, { recursive: true, force: true })
  }
  return target
}

/**
 * 读取一个技能文件的内容。
 *
 * @param query - URL 查询参数
 * @returns `{ path, content }`
 */
export function readSkillFile(query) {
  const target = asString(query.get('path')).trim()
  assert(target !== '', '缺少 path 参数')
  const root = rootOf(target)
  assert(root !== null, '目标不在任何技能根目录内')
  const resolved = resolve(target)
  assert(existsSync(resolved), `文件不存在：${resolved}`, 404)
  const stat = statSync(resolved)
  assert(stat.isFile(), '目标不是文件')
  assert(stat.size <= SKILL_FILE_LIMIT_BYTES, '文件过大，无法在设置里编辑')
  return { path: resolved, content: safeRead(resolved), root: root.id }
}

/**
 * 保存技能文件（有 path 时覆盖，无 path 时在用户根下新建）。
 *
 * @param body - 请求体：`{ path?, name?, content }`
 * @returns 处理结果
 */
export function saveSkill(body) {
  const content = asString(body.content)
  assert(content.trim() !== '', '技能内容不能为空')
  const target = asString(body.path).trim()
  if (target !== '') {
    const root = rootOf(target)
    assert(root !== null, '目标不在任何技能根目录内')
    const resolved = resolve(target)
    assert(resolved.toLowerCase().endsWith('.md'), '只允许写入 .md 文件')
    assert(existsSync(resolved), `文件不存在：${resolved}`, 404)
    writeFileSync(resolved, content, 'utf8')
    return { ok: true, mode: 'updated', path: resolved }
  }
  const name = asString(body.name).trim()
  assert(SKILL_NAME_RE.test(name), '技能名需为 kebab-case（小写字母、数字、短横线）')
  const root = skillRoots().find((item) => item.primary === true)
  const dir = join(root.dir, name)
  assert(!existsSync(dir), `技能 ${name} 已存在`, 409)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'SKILL.md')
  writeFileSync(file, content, 'utf8')
  return { ok: true, mode: 'created', path: file }
}

/**
 * 删除技能（移入回收站，不直接抹掉）。
 *
 * @param body - 请求体：`{ path }`
 * @returns 处理结果
 */
export function deleteSkill(body) {
  const target = asString(body.path).trim()
  assert(target !== '', '缺少 path 参数')
  const root = rootOf(target)
  assert(root !== null, '目标不在任何技能根目录内')
  const resolved = resolve(target)
  assert(existsSync(resolved), `文件不存在：${resolved}`, 404)
  // 目录 bundle 删整个目录，平铺文件只删该文件
  const source = basename(resolved).toLowerCase() === 'skill.md' ? dirname(resolved) : resolved
  const movedTo = moveToTrash(source)
  return { ok: true, movedTo }
}

/**
 * 同步来源目录：插件 config.syncSourceDir 优先，否则用 cc-switch 的技能目录。
 *
 * @param config - 插件配置
 * @returns 绝对路径
 */
export function syncSourceDir(config) {
  const configured = asString(asRecord(config).syncSourceDir).trim()
  return configured !== '' ? resolve(configured) : DEFAULT_SYNC_SOURCE
}

/**
 * 递归统计一棵技能目录的文件数、字节数与内容指纹。
 *
 * 指纹只用「相对路径 + 文件大小」，不读文件内容也不看 mtime：既快，又不会
 * 因为复制后时间戳变化而把「内容相同」误判成「需要更新」。
 *
 * @param dir - 目录绝对路径
 * @returns `{ files, bytes, signature }`
 */
function treeStamp(dir) {
  const rows = []
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    let children = []
    try {
      children = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const child of children) {
      const full = join(current, child.name)
      if (child.isDirectory()) {
        stack.push(full)
        continue
      }
      if (!child.isFile()) continue
      let size = 0
      try {
        size = statSync(full).size
      } catch {
        size = 0
      }
      rows.push({ rel: full.slice(dir.length + 1), size })
    }
  }
  rows.sort((left, right) => left.rel.localeCompare(right.rel))
  const hash = createHash('sha1')
  let bytes = 0
  for (const row of rows) {
    hash.update(`${row.rel}\u0000${row.size}\n`)
    bytes += row.size
  }
  return { files: rows.length, bytes, signature: hash.digest('hex') }
}

/**
 * 读取技能文件 frontmatter 里的 name，读不到时退回目录名。
 *
 * @param filePath - SKILL.md 或平铺 md 路径
 * @param fallback - 回退名
 * @returns 技能名
 */
function nameOf(filePath, fallback) {
  const parsed = parseFrontmatter(safeRead(filePath))
  const name = asString(parsed.data.name)
  return name !== '' ? name : fallback
}

/**
 * 同步方式：`link` 建软连接（默认），`copy` 复制文件。
 *
 * 软连接（Windows 目录联接）已实测可被 DSH 发现：本地技能根走 Node 枚举，
 * `nodeEntryKind()` 会把链接 stat 成目录，所以 `/` 菜单与模型技能目录都能看到。
 * 顺带好处是不占磁盘、cc-switch 改了立刻生效。
 *
 * 同步**只在你按下「同步」时执行**，没有任何自动同步（不随页面打开、
 * 不随保存、不随启动触发）。
 *
 * @param config - 插件配置
 * @param mode - 请求体里的覆盖值
 * @returns "link" | "copy"
 */
export function syncMode(config = {}, mode) {
  const wanted = asString(mode).trim() !== '' ? asString(mode).trim() : asString(asRecord(config).syncMode).trim()
  return wanted === 'copy' ? 'copy' : 'link'
}

/**
 * 删除一个路径：链接只摘链接本身，目录/文件整体删除。
 *
 * @param path - 目标路径
 */
function removePath(path) {
  if (!existsSync(path) && !isLink(path)) return
  if (isLink(path)) {
    unlinkSync(path)
    return
  }
  rmSync(path, { recursive: true, force: true, maxRetries: 2 })
}

/**
 * 把目标位置换成指向来源目录的链接（Windows 用目录联接，无需管理员权限）。
 *
 * @param sourcePath - 来源目录绝对路径
 * @param targetPath - 目标绝对路径
 */
function ensureLink(sourcePath, targetPath) {
  removePath(targetPath)
  mkdirSync(dirname(targetPath), { recursive: true })
  symlinkSync(sourcePath, targetPath, process.platform === 'win32' ? 'junction' : 'dir')
}

/**
 * 判断目标是否已经是指向来源的链接。
 *
 * @param targetPath - 目标路径
 * @param sourcePath - 来源路径
 * @returns 已正确链接时返回 true
 */
function isLinkedTo(targetPath, sourcePath) {
  if (!isLink(targetPath)) return false
  return realPathOf(targetPath).toLowerCase() === realPathOf(sourcePath).toLowerCase()
}

/**
 * 计算同步计划（只读，不落盘）。
 *
 * 状态含义（相对当前 mode）：
 * - `new`：目标里还没有；
 * - `update`：复制模式下内容不同，会整目录覆盖；
 * - `link`：软连接模式下目标已存在（副本或别的链接），会替换成指向来源的软连接；
 * - `same`：已是最新（软连接模式下即已正确链接），跳过。
 *
 * @param config - 插件配置
 * @param mode - 覆盖同步方式
 * @returns `{ mode, source, target, exists, items, counts }`
 */
export function planSync(config = {}, mode) {
  const resolvedMode = syncMode(config, mode)
  const source = resolve(syncSourceDir(config))
  const targetRoot = skillRoots().find((root) => root.primary === true)
  const target = resolve(targetRoot.dir)
  const items = []
  const exists = existsSync(source)
  if (exists) {
    let children = []
    try {
      children = readdirSync(source, { withFileTypes: true })
    } catch {
      children = []
    }
    for (const child of children) {
      if (child.name.startsWith('.')) continue
      const full = join(source, child.name)
      const targetPath = join(target, child.name)
      const kind = direntKind(full, child)
      if (kind === 'directory') {
        const skillFile = join(full, 'SKILL.md')
        if (!existsSync(skillFile)) continue
        const stamp = treeStamp(full)
        let state = 'new'
        if (existsSync(targetPath) || isLink(targetPath)) {
          if (resolvedMode === 'link') {
            state = isLinkedTo(targetPath, full) ? 'same' : 'link'
          } else {
            state = isLink(targetPath)
              ? 'update'
              : treeStamp(targetPath).signature === stamp.signature ? 'same' : 'update'
          }
        }
        items.push({
          name: nameOf(skillFile, child.name),
          dirName: child.name,
          kind: 'bundle',
          state,
          files: stamp.files,
          bytes: stamp.bytes,
        })
        continue
      }
      if (kind !== 'file' || !child.name.toLowerCase().endsWith('.md')) continue
      const base = basename(child.name, '.md')
      let size = 0
      try {
        size = statSync(full).size
      } catch {
        size = 0
      }
      let state = 'new'
      if (existsSync(targetPath) || isLink(targetPath)) {
        if (resolvedMode === 'link') {
          state = isLinkedTo(targetPath, full) ? 'same' : 'link'
        } else {
          state = isLink(targetPath) || safeRead(targetPath) !== safeRead(full) ? 'update' : 'same'
        }
      }
      items.push({ name: nameOf(full, base), dirName: child.name, kind: 'file', state, files: 1, bytes: size })
    }
  }
  items.sort((left, right) => left.dirName.localeCompare(right.dirName))
  const counts = { new: 0, update: 0, link: 0, same: 0 }
  for (const item of items) counts[item.state] += 1
  return { mode: resolvedMode, source, target, exists, items, counts }
}

/**
 * 执行同步。
 *
 * - `link` 模式：把每个条目换成指向来源的软连接（Windows 用目录联接），
 *   已正确链接的跳过；不再占用额外磁盘空间，源目录改动即时生效；
 * - `copy` 模式：把 new / update 的条目复制/覆盖进用户技能根，`same` 跳过。
 *
 * 复制走「临时目录 → 替换」，中途失败不会留下半个技能目录；两种模式都不会
 * 删除源里已不存在的目标技能。
 *
 * @param config - 插件配置
 * @param mode - 覆盖同步方式
 * @returns `{ mode, source, target, linked, relinked, copied, updated, skipped, failed }`
 */
export function runSync(config = {}, mode) {
  const plan = planSync(config, mode)
  assert(plan.exists, `同步来源不存在：${plan.source}`, 404)
  const from = resolve(plan.source)
  const to = resolve(plan.target)
  assert(from !== to, '同步来源与目标目录相同，无需同步')
  const nested = from.startsWith(to + sep) || to.startsWith(from + sep)
  assert(!nested, '同步来源与目标目录互相嵌套，已拒绝')
  const linked = []
  const relinked = []
  const copied = []
  const updated = []
  const skipped = []
  const failed = []
  mkdirSync(to, { recursive: true })
  for (const item of plan.items) {
    if (item.state === 'same') {
      skipped.push(item.dirName)
      continue
    }
    const sourcePath = join(from, item.dirName)
    const targetPath = join(to, item.dirName)
    try {
      if (plan.mode === 'link') {
        ensureLink(sourcePath, targetPath)
        if (item.state === 'new') linked.push(item.dirName)
        else relinked.push(item.dirName)
        continue
      }
      const temp = `${targetPath}.syncing-${process.pid}-${Date.now()}`
      try {
        cpSync(sourcePath, temp, { recursive: true, force: true, dereference: true })
        removePath(targetPath)
        renameSync(temp, targetPath)
      } catch (error) {
        try {
          removePath(temp)
        } catch {
          // 临时目录清理失败不影响结果汇报
        }
        throw error
      }
      if (item.state === 'new') copied.push(item.dirName)
      else updated.push(item.dirName)
    } catch (error) {
      failed.push({ name: item.dirName, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { mode: plan.mode, source: from, target: to, linked, relinked, copied, updated, skipped, failed }
}

/**
 * 在系统文件管理器里定位技能文件。
 *
 * @param body - 请求体：`{ path }`
 * @returns 处理结果
 */
export function revealSkill(body) {
  const target = asString(body.path).trim()
  assert(target !== '', '缺少 path 参数')
  const root = rootOf(target)
  assert(root !== null, '目标不在任何技能根目录内')
  const resolved = resolve(target)
  assert(existsSync(resolved), `文件不存在：${resolved}`, 404)
  const platform = process.platform
  const child = platform === 'win32'
    ? spawn('explorer.exe', [`/select,${resolved}`], { detached: true, stdio: 'ignore' })
    : platform === 'darwin'
      ? spawn('open', ['-R', resolved], { detached: true, stdio: 'ignore' })
      : spawn('xdg-open', [dirname(resolved)], { detached: true, stdio: 'ignore' })
  child.on('error', () => {})
  child.unref()
  return { ok: true, path: resolved }
}

/**
 * 挂载技能管理路由。
 *
 * @param host - 注入了 webServer 的宿主上下文
 * @returns 释放函数
 */
export function mountSkillRoutes(host, config = {}) {
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
    path: '/dsh-mcp-skill/skills',
    handler: guard(async (request, response) => {
      if (!requireMethod(request, response, 'GET')) return
      sendJson(response, 200, { ...listSkills(), syncSource: syncSourceDir(config) })
    }),
  }))

  disposers.push(webServer.register({
    kind: 'exact',
    path: '/dsh-mcp-skill/skills/sync',
    handler: guard(async (request, response) => {
      if (!requireTrustedPost(request, response)) return
      const body = asRecord(await readJsonBody(request))
      const mode = syncMode(config, body.mode)
      // dryRun：只算计划、不落盘，供页面在复制前预览
      sendJson(response, 200, body.dryRun === true ? planSync(config, mode) : runSync(config, mode))
    }),
  }))

  disposers.push(webServer.register({
    kind: 'exact',
    path: '/dsh-mcp-skill/skills/read',
    handler: guard(async (request, response) => {
      if (!requireMethod(request, response, 'GET')) return
      const url = new URL(request.url ?? '/', 'http://localhost')
      sendJson(response, 200, readSkillFile(url.searchParams))
    }),
  }))

  disposers.push(webServer.register({
    kind: 'exact',
    path: '/dsh-mcp-skill/skills/save',
    handler: guard(async (request, response) => {
      if (!requireTrustedPost(request, response)) return
      sendJson(response, 200, saveSkill(asRecord(await readJsonBody(request))))
    }),
  }))

  disposers.push(webServer.register({
    kind: 'exact',
    path: '/dsh-mcp-skill/skills/delete',
    handler: guard(async (request, response) => {
      if (!requireTrustedPost(request, response)) return
      sendJson(response, 200, deleteSkill(asRecord(await readJsonBody(request))))
    }),
  }))

  disposers.push(webServer.register({
    kind: 'exact',
    path: '/dsh-mcp-skill/skills/reveal',
    handler: guard(async (request, response) => {
      if (!requireTrustedPost(request, response)) return
      sendJson(response, 200, revealSkill(asRecord(await readJsonBody(request))))
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

