/**
 * profile patch（cordis.patch.yml）的极简文本编辑。
 *
 * 只用文本操作而不用 YAML 解析器：宿主把 `yaml` / `js-yaml` 打包在
 * app.asar 里，profile 插件按 Node 的解析规则拿不到它们；而我们必须
 * 保住用户手写的注释与 `!!js` 表达式。写入前一律留备份。
 *
 * 语义提醒（cordis-plugin-include 的 applyEntryPatches）：带 `insert`
 * 的 patch 行才会新增条目；只带 `id` 的行是对已有条目的覆盖。因此新增
 * MCP 服务器一律写成 `- insert: [ ... ]` 块。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { HttpError, assert } from './util.js'

/** DSH 配置根目录（与宿主的 $DSH_HOME 约定一致）。 */
export function dshHome() {
  const fromEnv = process.env.DSH_HOME
  return fromEnv !== undefined && fromEnv !== '' ? fromEnv : join(homedir(), '.dsh')
}

/**
 * 读取文本文件；文件不存在时返回空文本。
 *
 * @param path - 文件路径
 * @returns 文件文本
 */
export function readTextOrEmpty(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

/**
 * 探测文本的换行风格。
 *
 * @param text - 文件文本
 * @returns `\r\n` 或 `\n`
 */
export function detectEol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

/**
 * 渲染一个 YAML 标量。字符串统一转成双引号标量（JSON 字符串是合法的
 * YAML 双引号标量），这样冒号、井号、中文都不需要额外转义。
 *
 * @param value - 字符串 / 数字 / 布尔
 * @returns YAML 标量文本
 */
export function renderScalar(value) {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value === null || value === undefined) return 'null'
  return JSON.stringify(String(value))
}

/**
 * 渲染一个 YAML 键：普通标识符直接输出，其它（含冒号、空格）加双引号。
 *
 * @param key - 键名
 * @returns YAML 键文本
 */
function renderKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key)
}

/**
 * 把对象渲染成 YAML 块状映射行。
 *
 * @param value - 普通对象
 * @param indent - 键所在的缩进空格数
 * @returns 行数组（每项都不带换行符）
 */
function renderMapLines(value, indent) {
  const lines = []
  const pad = ' '.repeat(indent)
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue
    if (Array.isArray(item)) {
      if (item.length === 0) {
        lines.push(`${pad}${renderKey(key)}: []`)
        continue
      }
      lines.push(`${pad}${renderKey(key)}:`)
      for (const element of item) {
        lines.push(`${' '.repeat(indent + 2)}- ${renderScalar(element)}`)
      }
      continue
    }
    if (typeof item === 'object' && item !== null) {
      const nested = Object.entries(item)
      if (nested.length === 0) {
        lines.push(`${pad}${renderKey(key)}: {}`)
        continue
      }
      lines.push(`${pad}${renderKey(key)}:`)
      lines.push(...renderMapLines(item, indent + 2))
      continue
    }
    lines.push(`${pad}${renderKey(key)}: ${renderScalar(item)}`)
  }
  return lines
}

/**
 * 生成一条序列项（`- id / name / config`）。
 *
 * @param id - 条目 id
 * @param name - 模块名
 * @param config - 插件配置
 * @param indent - `- id` 所在行的缩进空格数
 * @returns 行数组（每项都不带换行符）
 */
export function renderEntryItem(id, name, config, indent) {
  const pad = ' '.repeat(indent)
  const lines = [`${pad}- id: ${renderScalar(id)}`, `${pad}  name: ${renderScalar(name)}`]
  if (config !== undefined) {
    lines.push(`${pad}  config:`)
    lines.push(...renderMapLines(config, indent + 4))
  }
  return lines
}

/**
 * 生成一整块 `- insert:` 补丁，用于新增条目。
 *
 * @param id - 条目 id
 * @param name - 模块名
 * @param config - 插件配置
 * @param eol - 换行符
 * @returns 该块的文本（以换行结尾）
 */
export function renderInsertBlock(id, name, config, eol) {
  const lines = ['- insert:', ...renderEntryItem(id, name, config, 4)]
  return lines.join(eol) + eol
}

/** 匹配序列项 id 行：`- id: xxx`。 */
const ID_LINE_RE = /^(\s*)-\s+id:\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^\s#]+))\s*(?:#.*)?$/

/** 匹配 `- insert:` 行。 */
const INSERT_LINE_RE = /^(\s*)-\s+insert:\s*(?:#.*)?$/

/**
 * 解析一行里声明的序列项 id。
 *
 * @param line - 单行文本
 * @returns `{ indent, id }`；不是 id 行时返回 null
 */
function matchIdLine(line) {
  const match = ID_LINE_RE.exec(line)
  if (match === null) return null
  if (match[2] !== undefined) return { indent: match[1].length, id: match[2].replace(/\\(.)/g, '$1') }
  return { indent: match[1].length, id: match[3] ?? match[4] ?? '' }
}

/**
 * 计算某个序列项块的结束行（左闭右开）。
 *
 * 只吃比该项缩进更深的行；遇到同级或更浅的“新行”即结束。块尾的空行与
 * 注释不算内容，因此不会被误删（注释留给下一条目）。
 *
 * @param lines - 已按行拆分的文本
 * @param start - 起始行号
 * @param indent - 该项 `- ` 的缩进
 * @returns 结束行号（左闭右开）
 */
function blockEnd(lines, start, indent) {
  let end = start + 1
  let lastContent = start + 1
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index]
    const trimmed = line.trim()
    if (trimmed === '') continue
    if (trimmed.startsWith('#')) continue
    const lineIndent = line.length - line.trimStart().length
    if (lineIndent <= indent) break
    lastContent = index + 1
  }
  end = lastContent
  return end
}

/**
 * 在 patch 文本里定位一条 id 行所在的块（以及它所属的 insert 块）。
 *
 * @param lines - 已按行拆分的文本
 * @param id - 目标 id
 * @returns 定位结果；找不到返回 null
 */
export function locateEntryBlock(lines, id) {
  for (let index = 0; index < lines.length; index++) {
    const matched = matchIdLine(lines[index])
    if (matched === null || matched.id !== id) continue
    const item = { start: index, end: blockEnd(lines, index, matched.indent), indent: matched.indent }
    // 向上找包住它的 `- insert:` 行（缩进必须更浅）
    let insert = null
    for (let up = index - 1; up >= 0; up--) {
      const line = lines[up]
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('#')) continue
      const lineIndent = line.length - line.trimStart().length
      if (lineIndent > matched.indent) continue
      if (lineIndent < matched.indent && INSERT_LINE_RE.test(line)) {
        insert = { start: up, end: blockEnd(lines, up, lineIndent), indent: lineIndent }
        break
      }
      // 同缩进或更浅的其它行：说明这一项不在 insert 块里
      break
    }
    return { item, insert }
  }
  return null
}

/**
 * 判断文本是否仍是一个顶层序列（本文件的基本结构）。
 *
 * 只看顶格行：顶格的非注释行必须是序列项 `- ...`；缩进行属于上一层，
 * 无需检查。
 *
 * @param text - YAML 文本
 * @returns 结构完好时返回 true
 */
export function looksLikeSequence(text) {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (line !== trimmed) continue
    if (!trimmed.startsWith('-') || (trimmed.length > 1 && trimmed[1] !== ' ')) return false
  }
  return true
}

/**
 * 备份一份文件到 `$DSH_HOME/dsh-peripherals/backups/`。
 *
 * @param path - 待备份的文件路径
 * @returns 备份文件路径
 */
export function backupFile(path) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = join(dshHome(), 'dsh-peripherals', 'backups')
  mkdirSync(dir, { recursive: true })
  const target = join(dir, `${stamp}-${path.split(/[\\/]/).pop() ?? 'file'}`)
  copyFileSync(path, target)
  return target
}

/**
 * 写入 patch 文本：先备份，再写入，最后校验顶层仍是 YAML 序列。
 *
 * @param path - patch 文件路径
 * @param text - 新文本
 * @returns 备份文件路径（文件原本不存在时返回 ''）
 */
export function writePatchText(path, text) {
  assert(looksLikeSequence(text), '生成后的 patch 不再是 YAML 序列，已放弃写入', 500)
  let backup = ''
  if (existsSync(path)) backup = backupFile(path)
  else mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text, 'utf8')
  return backup
}

/**
 * 在 patch 末尾追加一条新的 `- insert:` 块（新增条目）。
 *
 * @param path - patch 文件路径
 * @param id - 新条目 id
 * @param name - 模块名
 * @param config - 插件配置
 * @returns `{ backup, text }`
 */
export function appendInsertBlock(path, id, name, config) {
  const before = readTextOrEmpty(path)
  const eol = detectEol(before)
  assert(locateEntryBlock(before.split(/\r?\n/), id) === null, `profile patch 里已经有 id 为 ${id} 的条目了`, 409)
  const trimmed = before.replace(/\s+$/, '')
  const head = trimmed === '' ? '' : trimmed + eol
  const next = head + renderInsertBlock(id, name, config, eol)
  return { backup: writePatchText(path, next), text: next }
}

/**
 * 从 patch 里移除一条 id 条目的**全部**行。
 *
 * 同一条 id 可能同时出现在两处：`- insert:` 块里的条目本体，以及
 * configEditor 写入的顶层覆盖行。二者都要摘掉，否则覆盖行会留下一条
 * 「找不到条目」的无效 patch。独占 insert 块时整块一起移除。
 *
 * @param path - patch 文件路径
 * @param id - 目标条目 id
 * @returns `{ backup, text, removed }`
 */
export function removeEntryRow(path, id) {
  const before = readTextOrEmpty(path)
  assert(before !== '', 'profile patch 不存在或为空，无法删除', 404)
  const eol = detectEol(before)
  let lines = before.split(/\r?\n/)
  let removed = 0
  for (let guard = 0; guard < 20; guard++) {
    const located = locateEntryBlock(lines, id)
    if (located === null) break
    const { item, insert } = located
    // insert 块里只剩这一项时整块删掉，避免留下空的 `- insert:` 残留
    let start = item.start
    let end = item.end
    if (insert !== null) {
      const siblings = lines
        .slice(insert.start + 1, insert.end)
        .filter((line) => /^\s*-\s+id:/.test(line)).length
      if (siblings <= 1) {
        start = insert.start
        end = insert.end
      }
    }
    lines = lines.filter((_, index) => index < start || index >= end)
    removed += 1
  }
  assert(removed > 0, `profile patch 里找不到 id 为 ${id} 的条目（可能来自随包 patch 或 home patch）`, 404)
  const next = lines.join(eol)
  return { backup: writePatchText(path, next), text: next, removed }
}

/**
 * 读取 patch 文本里是否已有某个 id 条目。
 *
 * @param path - patch 文件路径
 * @param id - 目标 id
 * @returns 存在时返回 true
 */
export function hasEntryRow(path, id) {
  return locateEntryBlock(readTextOrEmpty(path).split(/\r?\n/), id) !== null
}

/**
 * 断言 patch 路径可用。
 *
 * @param path - patch 路径
 * @returns 传入的路径
 */
export function requirePatchPath(path) {
  if (typeof path !== 'string' || path === '') {
    throw new HttpError(500, '拿不到当前 profile 的 patch 路径（configEditor / profileContext 均不可用）')
  }
  return path
}
