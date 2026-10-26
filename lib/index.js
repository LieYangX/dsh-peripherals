/**
 * dsh-peripherals 宿主半侧。
 *
 * 职责只有一件事：把「MCP 管理 / 技能管理 / AGENTS.md 管理」需要的本机能力
 * 挂成同源 HTTP 路由，供浏览器半侧（client/client.js）调用。所有改动都落在
 * DSH 自己的位置：MCP 写 profile 的 cordis.patch.yml，技能写技能根目录里的
 * SKILL.md，AGENTS.md 写 DSH 真正会加载的那几个指令文件。
 */
import { mountMcpRoutes } from './mcp.js'
import { mountSkillRoutes } from './skills.js'
import { mountAgentRoutes } from './agents.js'

/** 插件名（也是 profile patch 里 insert 行的 name）。 */
export const name = 'dsh-peripherals'

/**
 * 插件入口：等 webServer 就绪后挂载全部路由。
 *
 * @param ctx - 宿主插件上下文
 * @param config - 插件配置（可选 `syncSourceDir` / `syncMode`）
 */
export function apply(ctx, config = {}) {
  ctx.inject(['webServer'], (host) => {
    host.effect(() => {
      const disposeMcp = mountMcpRoutes(host)
      const disposeSkill = mountSkillRoutes(host, config)
      const disposeAgent = mountAgentRoutes(host)
      ctx.logger?.info?.('dsh-peripherals: 已挂载 MCP / 技能 / AGENTS.md 管理路由')
      return () => {
        disposeMcp()
        disposeSkill()
        disposeAgent()
      }
    }, 'dsh-peripherals: http routes')
  })
}
