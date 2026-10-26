window.__ModuleLoader__.load({ id: "dsh-peripherals", factory: (require) => {
	var module = { exports: {} };
	var exports = module.exports;
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

	const react = require("react");
	const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
	const h = react.createElement;
	const { useState, useEffect, useCallback, useRef } = react;
	const Button = primitives.Button;
	const Modal = primitives.Modal;
	const Tag = primitives.Tag;
	const SegmentedControl = primitives.SegmentedControl;
	const SegmentedTabs = primitives.SegmentedTabs;
	const Switch = primitives.Switch;
	const Tooltip = primitives.Tooltip;
	const StateDot = primitives.StateDot;
	const IconCordisPluginOutlineRegular = primitives.IconCordisPluginOutlineRegular;
	const IconSkillOutlineRegular = primitives.IconSkillOutlineRegular;
	const IconPlusOutlineRegular = primitives.IconPlusOutlineRegular;
	const IconTrashOutlineRegular = primitives.IconTrashOutlineRegular;
	const IconEditOutlineRegular = primitives.IconEditOutlineRegular;
	const IconRefreshOutlineRegular = primitives.IconRefreshOutlineRegular;
	const IconWarningOutlineRegular = primitives.IconWarningOutlineRegular;
	const IconFolderOpenOutlineRegular = primitives.IconFolderOpenOutlineRegular;
	const IconCheckOutlineRegular = primitives.IconCheckOutlineRegular;
	const IconDownloadOutlineRegular = primitives.IconDownloadOutlineRegular;
	const IconListPenOutlineRegular = primitives.IconListPenOutlineRegular;
	const IconCodeOutlineRegular = primitives.IconCodeOutlineRegular;
	const IconSlidersTwoOutlineRegular = primitives.IconSlidersTwoOutlineRegular;

	//#region 样式
	/** 样式标记：热重载时复用同一个 <style>，但会刷新其内容。 */
	const STYLE_ID = "dsh-peripherals";
	/*
	 * 设计令牌声明在 :root 与 body 上 —— 本插件的表单在 Modal 里，primitives 的
	 * Modal 用 createPortal 渲染到 document.body，已经不在 .dmsm-root 子树内；
	 * 令牌若只声明在 .dmsm-root，弹窗里的输入框拿不到颜色/圆角，表现为
	 * 「没有边框、聚焦也没有蓝色描边」。另外 DSH 的 --dsw-* 令牌挂在 body
	 * （暗色主题在 body[data-ds-dark-theme]），所以别名也必须挂在 body 才
	 * 随手主题切换重新解析。
	 */
	const CSS = `
:root, body {
  --dmsm-text-1: var(--dsw-alias-label-primary, #1f2328);
  --dmsm-text-2: var(--dsw-alias-label-secondary, #6b7280);
  --dmsm-text-3: var(--dsw-alias-label-tertiary, #8b93a1);
  --dmsm-border-input: var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.16));
  --dmsm-radius-md: var(--dsw-radius-md, 8px);
  --dmsm-radius-xl: var(--dsw-radius-xl, 12px);
  --dmsm-brand: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, #4f6ef7));
  --dmsm-danger: var(--dsw-alias-state-error-primary, #d1242f);
  --dmsm-warn: var(--dsw-alias-state-warn-primary, #b45309);
  --dmsm-success: var(--dsw-alias-state-success-primary, #16a34a);
  --dmsm-mono: var(--dsw-font-mono, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace);
  /* 极淡底色 / 弹窗字段间的细分隔线：浅色主题下 bg-layer-* 全是白色，用层色会看不见 */
  --dmsm-hairline-soft: rgba(128, 128, 128, 0.14);
  --dmsm-surface-soft: rgba(128, 128, 128, 0.05);
}
/* 面板整页：与「插件」页同一套留白与节奏 */
.dmsm-panel {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow: auto;
  padding: 0 clamp(24px, 4vw, 48px) 40px;
  color: var(--dmsm-text-1);
}
/* 页头：20px 标题 + 13px 说明（对齐 .pageTitle / .pageIntro） */
.dmsm-page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-top: calc(28px + var(--dsh-frame-top-clearance, 0px));
}
.dmsm-page-title { margin: 0; font-size: 20px; font-weight: 500; line-height: 28px; }
.dmsm-page-intro { margin: 4px 0 0; font-size: 13px; line-height: 20px; color: var(--dmsm-text-2); }
/* 分段 tab（三页切换） */
.dmsm-tabs { flex: none; }
.dmsm-tab-body { flex: none; display: block; }

/* 页面主体（每个 tab 内容的骨架） */
.dmsm-root {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
  color: var(--dmsm-text-1);
}
/* 页面内的行：默认带标题头；flat 时只留一行说明 + 动作 */
.dmsm-head {
  flex: none;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 2px 2px 10px;
}
.dmsm-head-flat {
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 2px 8px;
}
.dmsm-head-icon { display: none; }
.dmsm-head-text { flex: 1; min-width: 0; }
.dmsm-title { margin: 0; font-size: 20px; font-weight: 500; line-height: 28px; }
.dmsm-sub { font-size: 13px; line-height: 20px; color: var(--dmsm-text-2); }
.dmsm-mono-text { font-family: var(--dmsm-mono); font-size: 11.5px; }
.dmsm-head-actions { flex: none; display: inline-flex; align-items: center; gap: 8px; }

/* 列表：与「插件」页的 .rows / .row 一致 —— 细线分隔、无卡片盒子 */
.dmsm-body {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.dmsm-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 2px;
  border: 0;
  background: transparent;
}
/* 悬停底色画成圆角浮层：分隔线仍是笔直的，只有底色有圆角 */
.dmsm-card::before {
  content: "";
  position: absolute;
  inset: 1px -8px;
  border-radius: var(--dmsm-radius-xl, 12px);
  background: transparent;
  pointer-events: none;
  transition: background-color 0.12s ease;
  z-index: 0;
}
.dmsm-card:hover::before { background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.1)); }
.dmsm-card > * { position: relative; z-index: 1; }
.dmsm-card-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dmsm-row-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.dmsm-name { font-size: 14px; font-weight: 500; line-height: 20px; }
.dmsm-desc { font-size: 13px; line-height: 18px; color: var(--dmsm-text-3); word-break: break-word; }
.dmsm-path {
  font-family: var(--dmsm-mono);
  font-size: 11.5px;
  line-height: 16px;
  color: var(--dmsm-text-3);
  overflow-wrap: anywhere;
}
/* 探活失败的原因：比路径信息更值得注意，用警告色 */
.dmsm-warn {
  font-size: 12px;
  line-height: 18px;
  color: var(--dmsm-warn);
  overflow-wrap: anywhere;
}
.dmsm-actions { flex: none; display: inline-flex; align-items: center; gap: 6px; }
.dmsm-empty {
  margin: 0;
  padding: 16px 2px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--dmsm-text-3);
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  white-space: pre-line;
}
.dmsm-loading { padding: 16px 2px; font-size: 13px; line-height: 20px; color: var(--dmsm-text-3); }
.dmsm-roots { font-size: 12px; line-height: 18px; color: var(--dmsm-text-3); padding-top: 8px; }
.dmsm-toolbar { flex: none; display: flex; align-items: center; gap: 8px; padding: 0 2px 8px; }
.dmsm-toolbar-text {
  flex: 1;
  min-width: 0;
  font-family: var(--dmsm-mono);
  font-size: 11.5px;
  line-height: 16px;
  color: var(--dmsm-text-3);
  overflow-wrap: anywhere;
}
/* 分组标题：对齐 .groupHead / .groupTitle */
.dmsm-group { flex: none; display: flex; align-items: baseline; gap: 8px; padding: 18px 2px 6px; }
.dmsm-group-title { font-size: 14px; font-weight: 500; line-height: 20px; }
.dmsm-group-path {
  flex: 1;
  min-width: 0;
  font-family: var(--dmsm-mono);
  font-size: 11.5px;
  line-height: 16px;
  color: var(--dmsm-text-3);
  overflow-wrap: anywhere;
}
/* 「还没建」的槽位：与普通行同高，不用虚线盒子 */
.dmsm-slot {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 2px;
  border: 0;
  background: transparent;
  color: var(--dmsm-text-2);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}
.dmsm-slot::before {
  content: "";
  position: absolute;
  inset: 1px -8px;
  border-radius: var(--dmsm-radius-xl, 12px);
  background: transparent;
  pointer-events: none;
  transition: background-color 0.12s ease;
  z-index: 0;
}
.dmsm-slot:hover::before { background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.1)); }
.dmsm-slot:hover { color: var(--dmsm-text-1); }
.dmsm-slot > * { position: relative; z-index: 1; }

/* 提示条 */
.dmsm-banner {
  flex: none;
  margin-bottom: 8px;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 12px;
  border-radius: var(--dmsm-radius-md, 8px);
  font-size: 13px;
  line-height: 20px;
}
.dmsm-banner[data-kind="ok"] { color: var(--dmsm-success); background: rgba(22, 163, 74, 0.12); }
.dmsm-banner[data-kind="error"] { color: var(--dmsm-danger); background: rgba(209, 36, 47, 0.12); }
.dmsm-banner[data-kind="info"] { color: var(--dmsm-text-2); background: var(--dmsm-surface-soft); }

/* 弹窗表单：字段与输入框沿用 DSH 设置页几何 */
.dmsm-field { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; }
.dmsm-field + .dmsm-field { border-top: 0.5px solid var(--dmsm-hairline-soft); }
.dmsm-label { font-size: 13px; font-weight: 500; line-height: 1.5; }
.dmsm-hint { font-size: 12px; line-height: 1.5; color: var(--dmsm-text-3); }
.dmsm-input, .dmsm-textarea {
  box-sizing: border-box;
  width: 100%;
  border: 0.5px solid transparent;
  border-color: var(--dmsm-border-input, rgba(0, 0, 0, 0.16));
  border-radius: var(--dmsm-radius-md, 8px);
  background: var(--dmsm-surface-soft);
  color: var(--dmsm-text-1);
  font-family: inherit;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.dmsm-input { height: 34px; padding: 0 12px; line-height: 1.5; }
.dmsm-textarea { padding: 8px 12px; line-height: 1.6; resize: vertical; min-height: 88px; }
.dmsm-input:hover, .dmsm-textarea:hover { border-color: var(--dmsm-text-3, #8b93a1); }
.dmsm-input:focus, .dmsm-textarea:focus {
  border-color: var(--dmsm-brand, #4f6ef7);
  box-shadow: 0 0 0 1px var(--dmsm-brand, #4f6ef7);
}
.dmsm-input::placeholder, .dmsm-textarea::placeholder { color: var(--dmsm-text-3, #8b93a1); }
.dmsm-textarea[data-mono="true"] { font-family: var(--dmsm-mono); font-size: 12.5px; }
.dmsm-textarea[data-size="tall"] { min-height: 260px; }
.dmsm-inline { display: flex; align-items: center; gap: 8px; }
.dmsm-inline-label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
.dmsm-modal { width: min(560px, calc(100vw - 48px)); }
.dmsm-modal-body { max-height: min(60vh, 460px); overflow: auto; padding-right: 2px; }
.dmsm-footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; width: 100%; }
.dmsm-footer-spacer { flex: 1; }
.dmsm-switch { display: inline-flex; align-items: center; padding-left: 4px; }
/* 弹窗列表里的细行（工具清单 / 同步计划） */
.dmsm-sync-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; }
.dmsm-sync-name { flex: 1; min-width: 0; font-size: 13px; line-height: 18px; }
.dmsm-sync-meta { font-size: 12px; line-height: 18px; color: var(--dmsm-text-3); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) {
  .dmsm-input, .dmsm-textarea { transition: none; }
  .dmsm-card::before, .dmsm-slot::before { transition: none; }
}
`;
	/**
	 * 注入（或刷新）插件样式。
	 *
	 * 已存在同标记的 <style> 时**就地更新内容**：client bundle 热重载后旧样式
	 * 还留在 DOM 里，早退会导致改动一直不生效。
	 */
	function ensureCss() {
		const selector = 'style[data-plugin-css="' + STYLE_ID + '"]';
		const existing = document.querySelector(selector);
		if (existing !== null) {
			if (existing.textContent !== CSS) existing.textContent = CSS;
			return;
		}
		const tag = document.createElement("style");
		tag.dataset.plugin = STYLE_ID;
		tag.dataset.pluginCss = STYLE_ID;
		tag.textContent = CSS;
		document.head.appendChild(tag);
	}
	//#endregion

	//#region 与宿主通信
	/**
	 * 调用本插件的同源 HTTP 路由；非 2xx 时抛出可读错误。
	 *
	 * @param path - 路由
	 * @param body - POST 时的 JSON 请求体
	 * @returns 解析后的 JSON
	 */
	async function callApi(path, body) {
		const init = { cache: "no-store" };
		if (body !== undefined) {
			init.method = "POST";
			init.headers = { "content-type": "application/json" };
			init.body = JSON.stringify(body);
		}
		let response;
		try {
			response = await fetch(path, init);
		} catch (error) {
			throw new Error("连不上宿主：" + (error && error.message ? error.message : String(error)));
		}
		let data = null;
		try {
			data = await response.json();
		} catch (error) {
			data = null;
		}
		if (!response.ok) throw new Error(data && data.error ? data.error : "请求失败（HTTP " + response.status + "）");
		return data === null ? {} : data;
	}

	/** 热加载（HMR 观察 patch 文件）需要一点时间，等它落地再刷新列表。 */
	const HOT_RELOAD_DELAY_MS = 2600;

	/**
	 * 当前平台标识（桌面壳会在 html 上写 data-platform）。
	 *
	 * @returns "darwin" | "win32" | "linux"
	 */
	function platformName() {
		const dataset = (typeof document !== "undefined" && document.documentElement && document.documentElement.dataset) || {};
		const raw = String(dataset.platform || "");
		if (raw === "darwin" || raw === "win32" || raw === "linux") return raw;
		const agent = typeof navigator !== "undefined" ? String(navigator.userAgent || "") : "";
		if (/Mac/i.test(agent)) return "darwin";
		if (/Win/i.test(agent)) return "win32";
		return "linux";
	}

	/** 各平台「文件管理器」在 open-in-app 目录里的应用 id。 */
	function fileManagerId() {
		const platform = platformName();
		if (platform === "darwin") return "finder";
		if (platform === "win32") return "explorer";
		return "filemanager";
	}

	/**
	 * 用 DSH 官方的 open-in-app 路由在系统文件管理器里「打开」一个目录。
	 *
	 * @param dir - 绝对目录路径
	 * @returns 固定返回 "opened"
	 */
	async function openInFileManager(dir) {
		const response = await fetch("/open-in-app/open", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ app: fileManagerId(), path: dir }),
			cache: "no-store",
		});
		if (!response.ok) throw new Error("open-in-app 打不开该目录（HTTP " + response.status + "）");
		return "opened";
	}

	/**
	 * 打开一个目录：优先官方 open-in-app，失败时退回本插件的 reveal 路由
	 * （在文件管理器里定位该目录）。
	 *
	 * @param dir - 绝对目录路径
	 * @returns "opened" | "revealed"
	 */
	async function openDirectory(dir) {
		try {
			return await openInFileManager(dir);
		} catch (error) {
			await callApi("/dsh-mcp-skill/skills/reveal", { path: dir });
			return "revealed";
		}
	}
	//#endregion

	//#region 共用小件
	/**
	 * 页面外框：图标 + 标题 + 说明 + 右上角动作 + 可选工具行 + 可滚动内容区。
	 *
	 * `flat` 用于分组 tab 内部：标题已经由 tab 表达，这里只留一行说明 + 动作。
	 */
	function PageShell({ icon, title, subtitle, actions, toolbar, banner, children, flat }) {
		const head = flat === true
			? h("div", { className: "dmsm-head dmsm-head-flat" },
				h("div", { className: "dmsm-head-text" },
					subtitle === null || subtitle === undefined ? null : h("div", { className: "dmsm-sub" }, subtitle)
				),
				h("div", { className: "dmsm-head-actions" }, actions)
			)
			: h("div", { className: "dmsm-head" },
				h("span", { className: "dmsm-head-icon" }, icon),
				h("div", { className: "dmsm-head-text" },
					h("div", { className: "dmsm-title" }, title),
					subtitle === null || subtitle === undefined ? null : h("div", { className: "dmsm-sub" }, subtitle)
				),
				h("div", { className: "dmsm-head-actions" }, actions)
			);
		return h("div", { className: "dmsm-root" },
			head,
			toolbar === null || toolbar === undefined ? null : toolbar,
			banner === null || banner === undefined ? null : h(Banner, banner),
			children
		);
	}

	/** 顶部提示条。 */
	function Banner({ kind, text }) {
		const icon = kind === "ok"
			? h(IconCheckOutlineRegular, { size: 14 })
			: kind === "error" ? h(IconWarningOutlineRegular, { size: 14 }) : null;
		return h("div", { className: "dmsm-banner", "data-kind": kind, role: kind === "error" ? "alert" : "status" },
			icon,
			h("span", null, text)
		);
	}

	/** 空心动作按钮：图标 + 可选文字（compact 时只留图标，靠 aria-label / tooltip 表达）。 */
	function ActionButton({ icon, label, onClick, disabled, title, variant, compact }) {
		const button = h(Button, {
			variant: variant === undefined ? "ghost" : variant,
			size: "sm",
			icon: icon,
			onClick: onClick,
			disabled: disabled === true,
			"aria-label": label,
		}, compact === true ? undefined : label);
		if (title === undefined) return button;
		return h(Tooltip, { label: title }, button);
	}

	/** 分节标题。 */
	function Field({ label, hint, children }) {
		return h("div", { className: "dmsm-field" },
			h("span", { className: "dmsm-label" }, label),
			children,
			hint === undefined ? null : h("span", { className: "dmsm-hint" }, hint)
		);
	}

	/** 单选分段：布尔开关的轻量替代。 */
	function TransportPicker({ value, onChange }) {
		return h(SegmentedControl, {
			id: "dmsm-transport",
			label: "传输方式",
			value: value,
			options: [
				{ value: "stdio", label: "本地进程 stdio" },
				{ value: "streamable-http", label: "远程 HTTP" },
			],
			onChange: onChange,
		});
	}
	//#endregion

	//#region MCP 管理页
	/** 新建/编辑表单的初始值。 */
	function emptyMcpValues() {
		return {
			serverName: "",
			transport: "stdio",
			url: "",
			headers: "",
			command: "",
			args: "",
			cwd: "",
			env: "",
			toolCallTimeoutMs: "",
			failOnStartupError: false,
		};
	}

	/**
	 * 把列表项里的 config 投影回表单值。
	 *
	 * @param config - 宿主返回的可编辑配置
	 * @returns 表单值
	 */
	function valuesOfMcp(config) {
		const base = emptyMcpValues();
		const source = config || {};
		base.serverName = typeof source.serverName === "string" ? source.serverName : "";
		base.transport = source.transport === "streamable-http" ? "streamable-http" : "stdio";
		base.url = typeof source.url === "string" ? source.url : "";
		base.headers = typeof source.headers === "string" ? source.headers : "";
		base.command = typeof source.command === "string" ? source.command : "";
		base.args = typeof source.args === "string" ? source.args : "";
		base.cwd = typeof source.cwd === "string" ? source.cwd : "";
		base.env = typeof source.env === "string" ? source.env : "";
		base.toolCallTimeoutMs = typeof source.toolCallTimeoutMs === "number" ? String(source.toolCallTimeoutMs) : "";
		base.failOnStartupError = source.failOnStartupError === true;
		return base;
	}

	/**
	 * 把表单值收敛成宿主接受的提交结构。
	 *
	 * @param values - 表单值
	 * @returns 提交结构
	 */
	function configOfMcp(values) {
		const config = {
			serverName: values.serverName.trim(),
			transport: values.transport,
		};
		if (values.transport === "streamable-http") {
			config.url = values.url.trim();
			config.headers = values.headers;
		} else {
			config.command = values.command.trim();
			config.args = values.args.trim();
			config.cwd = values.cwd.trim();
			config.env = values.env;
		}
		const timeout = Number.parseInt(values.toolCallTimeoutMs, 10);
		if (Number.isFinite(timeout) && timeout > 0) config.toolCallTimeoutMs = timeout;
		config.failOnStartupError = values.failOnStartupError === true;
		return config;
	}

	/** MCP 服务器编辑弹窗。 */
	function McpFormModal({ state, onClose, onSaved }) {
		const [values, setValues] = useState(() => state.server ? valuesOfMcp(state.server.config) : emptyMcpValues());
		const [busy, setBusy] = useState(false);
		const [error, setError] = useState(null);
		const setValue = (key, value) => setValues((prev) => {
			const next = Object.assign({}, prev);
			next[key] = value;
			return next;
		});
		const save = async () => {
			setBusy(true);
			setError(null);
			try {
				const body = { config: configOfMcp(values) };
				if (state.server) body.id = state.server.id;
				const result = await callApi("/dsh-mcp-skill/mcp/save", body);
				onSaved(result);
			} catch (failure) {
				setError(failure && failure.message ? failure.message : String(failure));
			} finally {
				setBusy(false);
			}
		};
		const http = values.transport === "streamable-http";
		return h(Modal, {
			open: true,
			onClose: busy ? () => {} : onClose,
			title: state.server ? "编辑 MCP 服务器" : "添加 MCP 服务器",
			closeLabel: "关闭",
			className: "dmsm-modal",
			contentClassName: "dmsm-modal-body",
			footer: h("div", { className: "dmsm-footer" },
				h("span", { className: "dmsm-footer-spacer" }),
				h(Button, { variant: "ghost", size: "md", onClick: onClose, disabled: busy }, "取消"),
				h(Button, { variant: "primary", size: "md", onClick: save, disabled: busy }, busy ? "保存中…" : "保存")
			),
		},
			error === null ? null : h(Banner, { kind: "error", text: error }),
			h(Field, {
				label: "服务器名（serverName）",
				hint: "工具会以 mcp__服务器名__工具名 的形式出现；只能用字母、数字、下划线、短横线，1-32 位。",
			}, h("input", {
				className: "dmsm-input",
				value: values.serverName,
				placeholder: "例如 github",
				onChange: (event) => setValue("serverName", event.target.value),
			})),
			h(Field, { label: "传输方式" },
				h(TransportPicker, {
					value: values.transport,
					onChange: (next) => setValue("transport", next),
				})
			),
			http === true
				? [
					h(Field, { key: "url", label: "服务地址（URL）", hint: "Streamable HTTP 端点，通常是 https://…/mcp。" },
						h("input", {
							className: "dmsm-input",
							value: values.url,
							placeholder: "https://example.com/mcp",
							onChange: (event) => setValue("url", event.target.value),
						})),
					h(Field, {
						key: "headers",
						label: "请求头（可选）",
						hint: "一行一个，格式 Name: value 或 Name=value；需要动态取值时可用 !!js 表达式。",
					}, h("textarea", {
						className: "dmsm-textarea",
						"data-mono": "true",
						value: values.headers,
						placeholder: "Authorization: Bearer xxxxx",
						onChange: (event) => setValue("headers", event.target.value),
					})),
				]
				: [
					h(Field, { key: "command", label: "启动命令", hint: "本地可执行文件，例如 npx。" },
						h("input", {
							className: "dmsm-input",
							value: values.command,
							placeholder: "npx",
							onChange: (event) => setValue("command", event.target.value),
						})),
					h(Field, { key: "args", label: "命令参数", hint: "以空格分隔，例如：-y @modelcontextprotocol/server-filesystem C:\\tmp" },
						h("input", {
							className: "dmsm-input",
							value: values.args,
							placeholder: "-y @scope/server",
							onChange: (event) => setValue("args", event.target.value),
						})),
					h(Field, { key: "env", label: "环境变量（可选）", hint: "一行一个 KEY=VALUE。" },
						h("textarea", {
							className: "dmsm-textarea",
							"data-mono": "true",
							value: values.env,
							placeholder: "GITHUB_TOKEN=xxxxx",
							onChange: (event) => setValue("env", event.target.value),
						})),
					h(Field, { key: "cwd", label: "工作目录（可选）" },
						h("input", {
							className: "dmsm-input",
							value: values.cwd,
							placeholder: "C:\\projects\\demo",
							onChange: (event) => setValue("cwd", event.target.value),
						})),
				],
			h("div", { className: "dmsm-field" },
				h("span", { className: "dmsm-label" }, "高级"),
				h("label", { className: "dmsm-inline" },
					h("input", {
						type: "checkbox",
						checked: values.failOnStartupError,
						onChange: (event) => setValue("failOnStartupError", event.target.checked),
					}),
					h("span", { className: "dmsm-inline-label" }, "连接失败时阻止该服务器加载（failOnStartupError）")
				)
			),
			h(Field, { label: "单次调用超时（毫秒，可选）", hint: "留空用默认 60000。" },
				h("input", {
					className: "dmsm-input",
					value: values.toolCallTimeoutMs,
					placeholder: "60000",
					onChange: (event) => setValue("toolCallTimeoutMs", event.target.value.replace(/[^0-9]/g, "")),
				})
			)
		);
	}

	/** MCP 服务器工具清单弹窗。 */
	function ToolListModal({ server, onClose }) {
		const tools = Array.isArray(server.tools) ? server.tools : [];
		return h(Modal, {
			open: true,
			onClose: onClose,
			title: server.serverName + " 的工具",
			closeLabel: "关闭",
			className: "dmsm-modal",
			contentClassName: "dmsm-modal-body",
			footer: h("div", { className: "dmsm-footer" },
				h("span", { className: "dmsm-footer-spacer" }),
				h(Button, { variant: "ghost", size: "md", onClick: onClose }, "关闭")
			),
		},
			h("div", { className: "dmsm-hint", style: { marginBottom: 8 } },
				"共 " + tools.length + " 个工具，模型看到的调用名都以 " + server.toolPrefix + " 开头。"),
			tools.length === 0
				? h("div", { className: "dmsm-empty" }, "这台服务器当前没有注册任何工具（未连接 / 已停用 / 服务器本身不声明工具）。")
				: tools.map((tool) => h("div", { className: "dmsm-sync-row", key: tool.name },
					h("div", { style: { flex: 1, minWidth: 0 } },
						h("div", { className: "dmsm-sync-name", style: { fontFamily: "var(--dmsm-mono)", fontSize: 12 } }, tool.name),
						tool.description === ""
							? null
							: h("div", { className: "dmsm-hint", style: { marginTop: 2 } }, tool.description)
					)
				))
		);
	}

	/** MCP 管理页。 */
	function McpPage({ remote, flat }) {
		const [state, setState] = useState({ loading: true, error: null, data: null });
		const [form, setForm] = useState(null);
		const [pendingDelete, setPendingDelete] = useState(null);
		const [banner, setBanner] = useState(null);
		const [deleting, setDeleting] = useState(false);
		const [toggling, setToggling] = useState(null);
		const [toolView, setToolView] = useState(null);
		const timer = useRef(null);

		const reload = useCallback(async () => {
			setState((prev) => Object.assign({}, prev, { loading: true }));
			try {
				const data = await callApi("/dsh-mcp-skill/mcp");
				setState({ loading: false, error: null, data });
			} catch (error) {
				setState({ loading: false, error: error && error.message ? error.message : String(error), data: null });
			}
		}, []);

		useEffect(() => {
			void reload();
			return () => {
				if (timer.current !== null) clearTimeout(timer.current);
			};
		}, [reload]);

		const scheduleReload = useCallback((message) => {
			setBanner({ kind: "ok", text: message });
			if (timer.current !== null) clearTimeout(timer.current);
			timer.current = setTimeout(() => {
				void reload();
			}, HOT_RELOAD_DELAY_MS);
		}, [reload]);

		const confirmDelete = async () => {
			if (pendingDelete === null) return;
			setDeleting(true);
			try {
				await callApi("/dsh-mcp-skill/mcp/delete", { id: pendingDelete.id });
				setPendingDelete(null);
				scheduleReload("已从 profile patch 移除「" + pendingDelete.serverName + "」，配置热加载中…");
			} catch (error) {
				setBanner({ kind: "error", text: error && error.message ? error.message : String(error) });
				setPendingDelete(null);
			} finally {
				setDeleting(false);
			}
		};

		/**
		 * 启用 / 停用一台服务器：直接调宿主官方的 pluginManager Remote，
		 * 由它把 disabled 写进 profile patch 并触发热重载（不必自己改 YAML）。
		 */
		const toggleServer = async (server, enabled) => {
			const manager = remote === undefined || remote === null ? undefined : remote.pluginManager;
			if (manager === undefined || manager === null || typeof manager.setPluginEnabled !== "function") {
				setBanner({ kind: "error", text: "宿主没有提供 pluginManager 服务，无法在这里启停。" });
				return;
			}
			setToggling(server.id);
			setBanner(null);
			try {
				const result = await manager.setPluginEnabled(server.id, enabled);
				if (result !== undefined && result !== null && result.ok === false) {
					throw new Error(result.error && result.error.message ? result.error.message : "启停失败");
				}
				scheduleReload("已" + (enabled ? "启用" : "停用") + "「" + server.serverName + "」，配置热加载中…");
			} catch (error) {
				setBanner({ kind: "error", text: error && error.message ? error.message : String(error) });
			} finally {
				setToggling(null);
			}
		};

		const servers = state.data && Array.isArray(state.data.servers) ? state.data.servers : [];
		const ready = state.data !== null && state.data.ready !== false;

		/**
		 * 一台服务器的连接状态标签：停用 > 探活结果 > 未验证。
		 *
		 * 判定依据是宿主侧的真实探活（HTTP 服务器发一次 initialize 握手，stdio 看工具
		 * 有没有注册上），不能用 loader 里有没有 fiber——那只说明插件条目挂上了，
		 * 远端服务没启动时照样是「有 fiber」，会把「断了」显示成「已连接」。
		 */
		const statusTag = (server) => {
			if (server.disabled === true) return h(Tag, { tone: "quiet" }, "已停用");
			const state = server.health && typeof server.health.state === "string" ? server.health.state : null;
			if (state === "connected") return h(Tag, { tone: "success" }, "已连接");
			if (state === "disconnected") return h(Tag, { tone: "warning" }, "未连接");
			if (state === "unknown") return h(Tag, { tone: "neutral" }, "未验证");
			// 宿主半侧还没重启（老列表接口没有 health 字段）时，一律不敢报「已连接」
			return h(Tag, { tone: "warning" }, "未验证");
		};

		/** 探活失败 / 探不准时，在行内补一句原因。 */
		const healthNote = (server) => {
			const health = server.health;
			if (health === undefined || health === null || health.state === "connected") return null;
			if (typeof health.detail !== "string" || health.detail === "") return null;
			return h("div", { className: "dmsm-warn" }, "探活：" + health.detail);
		};

		const body = state.loading && state.data === null
			? h("div", { className: "dmsm-loading" }, "正在读取 MCP 配置…")
			: state.error !== null
				? h("div", { className: "dmsm-empty" }, "读取失败：" + state.error)
				: servers.length === 0
					? h("div", { className: "dmsm-empty" },
						"还没有配置任何 MCP 服务器。" + String.fromCharCode(10) + "点右上角「添加服务器」，填好地址或启动命令即可立即接入。")
					: h("div", { className: "dmsm-body" }, servers.map((server) => h("div", { className: "dmsm-card", key: server.id },
						h("div", { className: "dmsm-card-main" },
							h("div", { className: "dmsm-row-title" },
								h("span", { className: "dmsm-name" }, server.serverName),
								h(Tag, { tone: server.transport === "streamable-http" ? "info" : "neutral" },
									server.transport === "streamable-http" ? "HTTP" : "stdio"),
								statusTag(server),
								Array.isArray(server.tools)
									? h(Tag, { tone: "neutral" }, "工具 " + server.tools.length)
									: null
							),
							h("div", { className: "dmsm-path" }, server.transport === "streamable-http" ? server.summary : "$ " + server.summary),
							healthNote(server),
							h("div", { className: "dmsm-path" }, "工具前缀 " + server.toolPrefix + "… · patch id " + server.patchId)
						),
						h("div", { className: "dmsm-actions" },
							Array.isArray(server.tools)
								? h(ActionButton, {
									label: "工具",
									title: "查看这台服务器注册的工具",
									icon: h(IconCodeOutlineRegular, { size: 14 }),
									onClick: () => setToolView(server),
								})
								: null,
							h(ActionButton, {
								label: "编辑",
								title: "编辑配置",
								icon: h(IconEditOutlineRegular, { size: 14 }),
								onClick: () => setForm({ server }),
							}),
							h(ActionButton, {
								label: "删除",
								title: "从 profile patch 中移除",
								icon: h(IconTrashOutlineRegular, { size: 14 }),
								onClick: () => setPendingDelete(server),
							}),
							h("span", { className: "dmsm-switch" },
								h(Switch, {
									checked: server.disabled !== true,
									label: (server.disabled === true ? "启用 " : "停用 ") + server.serverName,
									disabled: toggling === server.id,
									onChange: (next) => { void toggleServer(server, next); },
								})
							)
						)
					)));

		return h(PageShell, {
			flat: flat,
			icon: h(IconCordisPluginOutlineRegular, { size: 16 }),
			title: "MCP 管理",
			subtitle: ready
				? "共 " + servers.length + " 台 · 改动写到 " + (state.data && state.data.patchPath ? state.data.patchPath : "profile patch") + " 并热加载"
				: "宿主 loader 服务不可用：只读。",
			banner: banner,
			actions: [
				h(ActionButton, {
					key: "refresh",
					label: "刷新",
					title: "重新读取",
					compact: true,
					icon: h(IconRefreshOutlineRegular, { size: 14 }),
					onClick: () => { setBanner(null); void reload(); },
				}),
				h(Button, {
					key: "add",
					variant: "primary",
					size: "sm",
					icon: h(IconPlusOutlineRegular, { size: 14 }),
					onClick: () => setForm({ server: null }),
					disabled: state.data === null,
				}, "添加服务器"),
			],
		},
			body,
			toolView === null ? null : h(ToolListModal, {
				server: toolView,
				onClose: () => setToolView(null),
			}),
			form === null ? null : h(McpFormModal, {
				state: form,
				onClose: () => setForm(null),
				onSaved: (result) => {
					const name = form.server ? form.server.serverName : (result && result.id ? result.id : "");
					setForm(null);
					scheduleReload(result && result.mode === "created"
						? "已写入 profile patch（id: " + name + "），正在热加载…"
						: "配置已保存并即时生效。");
				},
			}),
			pendingDelete === null ? null : h(Modal, {
				open: true,
				onClose: deleting ? () => {} : () => setPendingDelete(null),
				title: "移除 MCP 服务器",
				closeLabel: "关闭",
				className: "dmsm-modal",
				footer: h("div", { className: "dmsm-footer" },
					h("span", { className: "dmsm-footer-spacer" }),
					h(Button, { variant: "ghost", size: "md", onClick: () => setPendingDelete(null), disabled: deleting }, "取消"),
					h(Button, { variant: "primary", size: "md", onClick: confirmDelete, disabled: deleting }, deleting ? "移除中…" : "确认移除")
				),
			},
				h("div", { className: "dmsm-desc" },
					"将从 profile patch 里删掉 " + (pendingDelete ? pendingDelete.serverName : "") + " 这条配置（原文件已自动备份）。"),
				h("div", { className: "dmsm-path", style: { marginTop: 8 } },
					pendingDelete && pendingDelete.patchId ? "- id: " + pendingDelete.patchId : "")
			)
		);
	}
	//#endregion

	//#region 技能管理页
	/** 新建技能的模板正文。 */
	function skillTemplate(name, description) {
		const title = name === "" ? "" : "# " + name;
		return [
			"---",
			"name: " + name,
			"description: " + description,
			"---",
			"",
			title,
			"",
			"在这里写清楚：这个技能解决什么问题、按什么步骤执行、有哪些注意事项。",
			"",
		].join("\n");
	}

	/** 新建技能弹窗。 */
	function SkillCreateModal({ onClose, onCreated }) {
		const [name, setName] = useState("");
		const [description, setDescription] = useState("");
		const [content, setContent] = useState("");
		const [touched, setTouched] = useState(false);
		const [busy, setBusy] = useState(false);
		const [error, setError] = useState(null);
		const effective = touched ? content : skillTemplate(name.trim(), description.trim());
		const create = async () => {
			setBusy(true);
			setError(null);
			try {
				const result = await callApi("/dsh-mcp-skill/skills/save", {
					name: name.trim(),
					content: effective,
				});
				onCreated(result);
			} catch (failure) {
				setError(failure && failure.message ? failure.message : String(failure));
			} finally {
				setBusy(false);
			}
		};
		return h(Modal, {
			open: true,
			onClose: busy ? () => {} : onClose,
			title: "新建技能",
			closeLabel: "关闭",
			className: "dmsm-modal",
			contentClassName: "dmsm-modal-body",
			footer: h("div", { className: "dmsm-footer" },
				h("span", { className: "dmsm-footer-spacer" }),
				h(Button, { variant: "ghost", size: "md", onClick: onClose, disabled: busy }, "取消"),
				h(Button, { variant: "primary", size: "md", onClick: create, disabled: busy }, busy ? "创建中…" : "创建")
			),
		},
			error === null ? null : h(Banner, { kind: "error", text: error }),
			h(Field, { label: "技能名（name）", hint: "kebab-case，例如 pdf-export；会写入 ~/.dsh/skills/<名字>/SKILL.md。" },
				h("input", {
					className: "dmsm-input",
					value: name,
					placeholder: "pdf-export",
					onChange: (event) => setName(event.target.value),
				})),
			h(Field, { label: "一句话描述", hint: "写「什么时候该用它」，模型据此判断是否调用。" },
				h("input", {
					className: "dmsm-input",
					value: description,
					placeholder: "把 Markdown 文档导出成排版好的 PDF",
					onChange: (event) => setDescription(event.target.value),
				})),
			h(Field, { label: "SKILL.md 内容", hint: "已按名字与描述生成骨架，可以直接改成完整流程。" },
				h("textarea", {
					className: "dmsm-textarea",
					"data-mono": "true",
					"data-size": "tall",
					value: effective,
					onChange: (event) => {
						setTouched(true);
						setContent(event.target.value);
					},
				}))
		);
	}

	/** 技能内容编辑弹窗。 */
	function SkillEditorModal({ skill, onClose, onSaved }) {
		const [content, setContent] = useState(skill.content === undefined ? "" : skill.content);
		const [loading, setLoading] = useState(skill.content === undefined);
		const [saving, setSaving] = useState(false);
		const [error, setError] = useState(null);

		useEffect(() => {
			if (skill.content !== undefined) return;
			let alive = true;
			callApi("/dsh-mcp-skill/skills/read?path=" + encodeURIComponent(skill.path))
				.then((data) => {
					if (!alive) return;
					setContent(typeof data.content === "string" ? data.content : "");
					setLoading(false);
				})
				.catch((failure) => {
					if (!alive) return;
					setError(failure && failure.message ? failure.message : String(failure));
					setLoading(false);
				});
			return () => { alive = false; };
		}, [skill]);

		const save = async () => {
			setSaving(true);
			setError(null);
			try {
				await callApi("/dsh-mcp-skill/skills/save", { path: skill.path, content });
				onSaved();
			} catch (failure) {
				setError(failure && failure.message ? failure.message : String(failure));
			} finally {
				setSaving(false);
			}
		};

		return h(Modal, {
			open: true,
			onClose: saving ? () => {} : onClose,
			title: "编辑 " + skill.name,
			closeLabel: "关闭",
			className: "dmsm-modal",
			contentClassName: "dmsm-modal-body",
			footer: h("div", { className: "dmsm-footer" },
				h("span", { className: "dmsm-footer-spacer" }),
				h(Button, { variant: "ghost", size: "md", onClick: onClose, disabled: saving }, "取消"),
				h(Button, { variant: "primary", size: "md", onClick: save, disabled: saving || loading }, saving ? "保存中…" : "保存")
			),
		},
			error === null ? null : h(Banner, { kind: "error", text: error }),
			h("div", { className: "dmsm-path", style: { marginBottom: 8 } }, skill.path),
			skill.linked === true
				? h("div", { className: "dmsm-hint", style: { marginBottom: 8 } },
					"该技能是软连接，保存会直接写入源目录 " + skill.linkedTo + "。")
				: null,
			loading
				? h("div", { className: "dmsm-loading" }, "正在读取…")
				: h("textarea", {
					className: "dmsm-textarea",
					"data-mono": "true",
					"data-size": "tall",
					value: content,
					onChange: (event) => setContent(event.target.value),
				})
		);
	}

	/** 从 cc-switch 同步技能：先预览计划，再确认复制。 */
	function SyncModal({ source, onClose, onDone }) {
		const [state, setState] = useState({ loading: true, error: null, plan: null });
		const [busy, setBusy] = useState(false);
		const [error, setError] = useState(null);
		/** 同步方式：软连接（默认，不占空间、改了立刻生效）或复制文件。 */
		const [mode, setMode] = useState("link");

		useEffect(() => {
			let alive = true;
			setState({ loading: true, error: null, plan: null });
			callApi("/dsh-mcp-skill/skills/sync", { dryRun: true, mode })
				.then((plan) => {
					if (alive) setState({ loading: false, error: null, plan });
				})
				.catch((failure) => {
					if (alive) {
						setState({ loading: false, error: failure && failure.message ? failure.message : String(failure), plan: null });
					}
				});
			return () => { alive = false; };
		}, [mode]);

		const plan = state.plan;
		const pending = plan === null ? [] : plan.items.filter((item) => item.state !== "same");
		const counts = plan === null ? { new: 0, update: 0, link: 0, same: 0 } : plan.counts;
		const run = async () => {
			setBusy(true);
			setError(null);
			try {
				const result = await callApi("/dsh-mcp-skill/skills/sync", { mode });
				onDone(result);
			} catch (failure) {
				setError(failure && failure.message ? failure.message : String(failure));
				setBusy(false);
			}
		};

		const summary = [
			counts["new"] > 0 ? counts["new"] + " 个新增" : "",
			counts.update > 0 ? counts.update + " 个更新" : "",
			counts.link > 0 ? counts.link + " 个转软连接" : "",
			counts.same > 0 ? counts.same + " 个已是最新" : "",
		].filter((part) => part !== "").join(" · ");
		// 旧宿主没有这个路由：静态页面处理器对未知 POST 会回 404/405
		const missingRoute = state.error !== null && /(404|405)/.test(state.error);
		const stateLabel = (state) => (state === "new" ? "新增" : state === "link" ? "转软连接" : state === "update" ? "覆盖" : "已是最新");
		const stateTone = (state) => (state === "new" ? "success" : state === "link" ? "info" : "warning");

		return h(Modal, {
			open: true,
			onClose: busy ? () => {} : onClose,
			title: "同步技能",
			closeLabel: "关闭",
			className: "dmsm-modal",
			contentClassName: "dmsm-modal-body",
			footer: h("div", { className: "dmsm-footer" },
				h("span", { className: "dmsm-footer-spacer" }),
				h(Button, { variant: "ghost", size: "md", onClick: onClose, disabled: busy }, "取消"),
				h(Button, {
					variant: "primary",
					size: "md",
					onClick: run,
					disabled: busy || plan === null || pending.length === 0,
				}, busy
					? "同步中…"
					: mode === "link"
						? "建立 " + pending.length + " 个软连接"
						: "复制 " + pending.length + " 个")
			),
		},
			error === null ? null : h(Banner, { kind: "error", text: error }),
			h("div", { className: "dmsm-path", style: { marginBottom: 10 } }, "来源：" + source),
			h("div", { style: { marginBottom: 8 } },
				h(SegmentedControl, {
					id: "dmsm-sync-mode",
					label: "同步方式",
					value: mode,
					options: [
						{ value: "link", label: "软连接" },
						{ value: "copy", label: "复制文件" },
					],
					onChange: (next) => { if (!busy) setMode(next === "copy" ? "copy" : "link"); },
				})),
			h("div", { className: "dmsm-hint", style: { marginBottom: 8 } },
				mode === "link"
					? "软连接（默认）：不额外占磁盘，cc-switch 里改了 DSH 立刻生效（Windows 用目录联接，无需管理员权限）。"
					: "复制文件：两边各自独立，源目录后续改动需要再同步一次。"),
			state.loading
				? h("div", { className: "dmsm-loading" }, "正在对比技能目录…")
				: state.error !== null
					? h("div", null,
						h(Banner, { kind: "error", text: state.error }),
						missingRoute
							? h("div", { className: "dmsm-hint", style: { marginTop: 8 } },
								"同步接口还没加载：宿主侧代码已经更新，重启一次应用后即可使用。")
							: null)
					: plan.exists !== true
						? h("div", { className: "dmsm-hint" }, "找不到同步来源目录，请确认 cc-switch 里已经下载了技能。")
						: h("div", null,
							h("div", { className: "dmsm-desc", style: { marginBottom: 4 } }, summary),
							h("div", { className: "dmsm-hint", style: { marginBottom: 8 } },
								"只做单向同步：写入 " + plan.target + "，不会删除 DSH 里已有的技能。"),
							pending.length === 0
								? h("div", { className: "dmsm-empty" }, "全部已是最新，无需同步。")
								: pending.map((item) => h("div", { className: "dmsm-sync-row", key: item.dirName },
									h("span", { className: "dmsm-sync-name" }, item.name),
									h(Tag, { tone: stateTone(item.state) }, stateLabel(item.state)),
									h("span", { className: "dmsm-sync-meta" }, item.files + " 文件 · " + formatBytes(item.bytes))
								)))
		);
	}

	/** 人类可读的字节数。 */
	function formatBytes(bytes) {
		if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return "0 B";
		if (bytes < 1024) return bytes + " B";
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
		return (bytes / 1024 / 1024).toFixed(1) + " MB";
	}

	/** 技能管理页。 */
	function SkillPage({ flat }) {
		const [state, setState] = useState({ loading: true, error: null, data: null });
		const [creating, setCreating] = useState(false);
		const [editing, setEditing] = useState(null);
		const [pendingDelete, setPendingDelete] = useState(null);
		const [banner, setBanner] = useState(null);
		const [deleting, setDeleting] = useState(false);
		const [syncing, setSyncing] = useState(false);

		const reload = useCallback(async () => {
			setState((prev) => Object.assign({}, prev, { loading: true }));
			try {
				const data = await callApi("/dsh-mcp-skill/skills");
				setState({ loading: false, error: null, data });
			} catch (error) {
				setState({ loading: false, error: error && error.message ? error.message : String(error), data: null });
			}
		}, []);

		useEffect(() => { void reload(); }, [reload]);

		const removeSkill = async () => {
			if (pendingDelete === null) return;
			setDeleting(true);
			try {
				await callApi("/dsh-mcp-skill/skills/delete", { path: pendingDelete.path });
				setBanner({ kind: "ok", text: "已把「" + pendingDelete.name + "」移入回收站（~/.dsh/dsh-peripherals/trash）。" });
				setPendingDelete(null);
				await reload();
			} catch (error) {
				setBanner({ kind: "error", text: error && error.message ? error.message : String(error) });
				setPendingDelete(null);
			} finally {
				setDeleting(false);
			}
		};

		const reveal = async (skill) => {
			try {
				await callApi("/dsh-mcp-skill/skills/reveal", { path: skill.path });
			} catch (error) {
				setBanner({ kind: "error", text: error && error.message ? error.message : String(error) });
			}
		};

		/** 一键打开技能目录：优先用户级根，没有再退到第一个存在的根。 */
		const openSkillsDir = async () => {
			const candidate = primary !== undefined && primary.exists === true
				? primary
				: roots.filter((root) => root.exists === true)[0] || primary;
			if (candidate === undefined) {
				setBanner({ kind: "error", text: "还没有可打开的技能目录。" });
				return;
			}
			if (candidate.exists !== true) {
				setBanner({ kind: "error", text: "技能目录还不存在（" + candidate.dir + "）：先新建一个技能，它就会出现在这里。" });
				return;
			}
			try {
				const how = await openDirectory(candidate.dir);
				setBanner(how === "revealed"
					? { kind: "info", text: "已在文件管理器中定位技能目录：" + candidate.dir }
					: null);
			} catch (error) {
				setBanner({ kind: "error", text: error && error.message ? error.message : String(error) });
			}
		};

		const skills = state.data && Array.isArray(state.data.skills) ? state.data.skills : [];
		const roots = state.data && Array.isArray(state.data.roots) ? state.data.roots : [];
		const primary = roots.filter((root) => root.primary === true)[0];
		// 只展示真实存在的根目录，外加新建技能的目标根（可能还没建出来）
		const shownRoots = roots.filter((root) => root.exists === true || root.primary === true);
		const syncSource = state.data && typeof state.data.syncSource === "string" && state.data.syncSource !== ""
			? state.data.syncSource
			: "~/.cc-switch/skills";
		const subtitle = state.data === null
			? "读取本机技能目录…"
			: "共 " + skills.length + " 个技能 · 新建技能写入 " + (primary ? primary.dir : "~/.dsh/skills") + " · 改动即时生效";

		const body = state.loading && state.data === null
			? h("div", { className: "dmsm-loading" }, "正在扫描技能目录…")
			: state.error !== null
				? h("div", { className: "dmsm-empty" }, "读取失败：" + state.error)
				: h("div", { className: "dmsm-body" },
					skills.length === 0
						? h("div", { className: "dmsm-empty" },
							"还没有技能。" + String.fromCharCode(10) + "点右上角「新建技能」，描述「什么时候用它」，模型就会在需要时调用。")
						: skills.map((skill) => h("div", { className: "dmsm-card", key: skill.id },
							h("div", { className: "dmsm-card-main" },
								h("div", { className: "dmsm-row-title" },
									h("span", { className: "dmsm-name" }, skill.name),
									h(Tag, { tone: skill.scope === "user" ? "info" : "neutral" }, skill.sourceLabel),
									skill.linked === true ? h(Tag, { tone: "success" }, "软连接") : null,
									skill.modelInvocable === false ? h(Tag, { tone: "quiet" }, "仅用户可调用") : null,
									skill.effective === false ? h(Tag, { tone: "quiet" }, "被同名技能覆盖") : null,
									skill.valid === false ? h(Tag, { tone: "warning" }, "需要修复") : null
								),
								h("div", { className: "dmsm-desc" }, skill.description === "" ? "（没有 description）" : skill.description),
								skill.whenToUse === "" ? null : h("div", { className: "dmsm-desc" }, "适用场景：" + skill.whenToUse),
								skill.valid === false
									? h("div", { className: "dmsm-path" }, "问题：" + skill.problems.join("；"))
									: null,
								h("div", { className: "dmsm-path" }, skill.path)
							),
							h("div", { className: "dmsm-actions" },
								h(ActionButton, {
									label: "编辑",
									title: "编辑 SKILL.md",
									icon: h(IconEditOutlineRegular, { size: 14 }),
									onClick: () => setEditing(skill),
								}),
								h(ActionButton, {
									label: "定位",
									title: "在文件管理器中显示",
									icon: h(IconFolderOpenOutlineRegular, { size: 14 }),
									onClick: () => { void reveal(skill); },
								}),
								h(ActionButton, {
									label: "删除",
									title: "移入回收站",
									icon: h(IconTrashOutlineRegular, { size: 14 }),
									onClick: () => setPendingDelete(skill),
								})
							)
						)),
					h("div", { className: "dmsm-roots" },
						"扫描目录：" + shownRoots.map((root) => root.dir + (root.exists === true ? "" : "（新建时创建）")).join(" · "))
				);

		return h(PageShell, {
			flat: flat,
			icon: h(IconSkillOutlineRegular, { size: 16 }),
			title: "技能管理",
			subtitle,
			banner,
			toolbar: h("div", { className: "dmsm-toolbar" },
				h("span", { className: "dmsm-toolbar-text" }, "同步来源：" + syncSource),
				h(Button, {
					variant: "outline",
					size: "sm",
					icon: h(IconDownloadOutlineRegular, { size: 14 }),
					onClick: () => { setBanner(null); setSyncing(true); },
				}, "同步")
			),
			actions: [
				h(ActionButton, {
					key: "open-dir",
					label: "打开目录",
					title: "在系统文件管理器中打开技能目录",
					icon: h(IconFolderOpenOutlineRegular, { size: 14 }),
					onClick: () => { void openSkillsDir(); },
				}),
				h(ActionButton, {
					key: "refresh",
					label: "刷新",
					title: "重新扫描",
					compact: true,
					icon: h(IconRefreshOutlineRegular, { size: 14 }),
					onClick: () => { setBanner(null); void reload(); },
				}),
				h(Button, {
					key: "add",
					variant: "primary",
					size: "sm",
					icon: h(IconPlusOutlineRegular, { size: 14 }),
					onClick: () => setCreating(true),
				}, "新建技能"),
			],
		},
			body,
			syncing
				? h(SyncModal, {
					source: syncSource,
					onClose: () => setSyncing(false),
					onDone: (result) => {
						setSyncing(false);
						const linked = result && Array.isArray(result.linked) ? result.linked : [];
						const relinked = result && Array.isArray(result.relinked) ? result.relinked : [];
						const copied = result && Array.isArray(result.copied) ? result.copied : [];
						const updated = result && Array.isArray(result.updated) ? result.updated : [];
						const failed = result && Array.isArray(result.failed) ? result.failed : [];
						const parts = [
							linked.length > 0 ? "新建软连接 " + linked.length + " 个" : "",
							relinked.length > 0 ? "转为软连接 " + relinked.length + " 个" : "",
							copied.length > 0 ? "复制 " + copied.length + " 个" : "",
							updated.length > 0 ? "覆盖 " + updated.length + " 个" : "",
						].filter((part) => part !== "");
						if (failed.length > 0) {
							setBanner({
								kind: "error",
								text: "同步完成，但有 " + failed.length + " 个失败：" + failed.map((item) => item.name).join("、"),
							});
						} else if (parts.length === 0) {
							setBanner({ kind: "info", text: "全部已是最新，没有需要同步的技能。" });
						} else {
							setBanner({ kind: "ok", text: "同步完成：" + parts.join("，") + "。" });
						}
						void reload();
					},
				})
				: null,
			creating
				? h(SkillCreateModal, {
					onClose: () => setCreating(false),
					onCreated: (result) => {
						setCreating(false);
						setBanner({ kind: "ok", text: "已创建 " + (result && result.path ? result.path : "技能") + "，可继续编辑内容。" });
						void reload();
					},
				})
				: null,
			editing === null ? null : h(SkillEditorModal, {
				skill: editing,
				onClose: () => setEditing(null),
				onSaved: () => {
					setEditing(null);
					setBanner({ kind: "ok", text: "已保存，技能目录会立即刷新。" });
					void reload();
				},
			}),
			pendingDelete === null ? null : h(Modal, {
				open: true,
				onClose: deleting ? () => {} : () => setPendingDelete(null),
				title: "删除技能",
				closeLabel: "关闭",
				className: "dmsm-modal",
				footer: h("div", { className: "dmsm-footer" },
					h("span", { className: "dmsm-footer-spacer" }),
					h(Button, { variant: "ghost", size: "md", onClick: () => setPendingDelete(null), disabled: deleting }, "取消"),
					h(Button, { variant: "primary", size: "md", onClick: removeSkill, disabled: deleting }, deleting ? "删除中…" : "移入回收站")
				),
			},
				h("div", { className: "dmsm-desc" }, "「" + pendingDelete.name + "」会被移入回收站，随时可以从 ~/.dsh/dsh-peripherals/trash 取回。"),
				h("div", { className: "dmsm-hint", style: { marginTop: 6 } },
					"删除后不会被自动重建；需要它回来时，再点一次「同步」即可。"),
				pendingDelete.linked === true
					? h("div", { className: "dmsm-desc", style: { marginTop: 6 } },
						"这是软连接，只会移除链接本身，不会影响源目录 " + pendingDelete.linkedTo + "。")
					: null,
				h("div", { className: "dmsm-path", style: { marginTop: 8 } }, pendingDelete.path)
			)
		);
	}
	//#endregion

	//#region 智能体个性管理页
	/** 新建指令文件的骨架。 */
	function agentTemplate(kind) {
		if (kind === "global") {
			return ["# 全局约定", "", "- 与人类沟通使用中文。", "- 代码注释使用中文。", ""].join("\n");
		}
		return ["# 项目说明", "", "## 约定", "", "- ", ""].join("\n");
	}

	/** 目录链角色标签。 */
	function roleLabel(role) {
		if (role === "root") return "项目根";
		if (role === "cwd") return "工作目录";
		return "上级目录";
	}

	/** 一个指令文件条目的标签集合。 */
	function agentTags(slot, role) {
		const tags = [];
		if (slot.kind === "global") tags.push(h(Tag, { key: "g", tone: "info" }, "全局"));
		else if (slot.kind === "local") tags.push(h(Tag, { key: "l", tone: "quiet" }, "本地 overlay"));
		if (role !== undefined && slot.kind !== "global") tags.push(h(Tag, { key: "r", tone: "neutral" }, roleLabel(role)));
		return tags;
	}

	/** 指令文件编辑弹窗。 */
	function AgentEditorModal({ slot, onClose, onSaved }) {
		const [content, setContent] = useState(slot.content !== undefined
			? slot.content
			: agentTemplate(slot.kind === "global" ? "global" : "project"));
		const [loading, setLoading] = useState(slot.content === undefined && slot.exists === true);
		const [saving, setSaving] = useState(false);
		const [error, setError] = useState(null);

		useEffect(() => {
			if (!loading) return undefined;
			let alive = true;
			callApi("/dsh-mcp-skill/agents/read?path=" + encodeURIComponent(slot.path))
				.then((data) => {
					if (!alive) return;
					setContent(typeof data.content === "string" ? data.content : "");
					setLoading(false);
				})
				.catch((failure) => {
					if (!alive) return;
					setError(failure && failure.message ? failure.message : String(failure));
					setLoading(false);
				});
			return () => { alive = false; };
		}, [loading, slot.path]);

		const save = async () => {
			setSaving(true);
			setError(null);
			try {
				await callApi("/dsh-mcp-skill/agents/save", { path: slot.path, content });
				onSaved(slot.exists === true);
			} catch (failure) {
				setError(failure && failure.message ? failure.message : String(failure));
			} finally {
				setSaving(false);
			}
		};

		return h(Modal, {
			open: true,
			onClose: saving ? () => {} : onClose,
			title: (slot.exists === true ? "编辑 " : "新建 ") + slot.name,
			closeLabel: "关闭",
			className: "dmsm-modal",
			contentClassName: "dmsm-modal-body",
			footer: h("div", { className: "dmsm-footer" },
				h("span", { className: "dmsm-footer-spacer" }),
				h(Button, { variant: "ghost", size: "md", onClick: onClose, disabled: saving }, "取消"),
				h(Button, { variant: "primary", size: "md", onClick: save, disabled: saving || loading }, saving ? "保存中…" : "保存")
			),
		},
			error === null ? null : h(Banner, { kind: "error", text: error }),
			h("div", { className: "dmsm-path", style: { marginBottom: 8 } }, slot.path),
			h("div", { className: "dmsm-hint", style: { marginBottom: 8 } },
				"保存后从下一次请求开始生效；同一目录里与 AGENTS.md 内容相同的 CLAUDE.md 只会加载一次。"),
			loading
				? h("div", { className: "dmsm-loading" }, "正在读取…")
				: h("textarea", {
					className: "dmsm-textarea",
					"data-mono": "true",
					"data-size": "tall",
					value: content,
					onChange: (event) => setContent(event.target.value),
				})
		);
	}

	/** 智能体个性管理页。 */
	function AgentsPage({ flat }) {
		const [state, setState] = useState({ loading: true, error: null, data: null });
		const [editing, setEditing] = useState(null);
		const [pendingDelete, setPendingDelete] = useState(null);
		const [banner, setBanner] = useState(null);
		const [deleting, setDeleting] = useState(false);

		const reload = useCallback(async () => {
			setState((prev) => Object.assign({}, prev, { loading: true }));
			try {
				const data = await callApi("/dsh-mcp-skill/agents");
				setState({ loading: false, error: null, data });
			} catch (error) {
				setState({ loading: false, error: error && error.message ? error.message : String(error), data: null });
			}
		}, []);

		useEffect(() => { void reload(); }, [reload]);

		const removeInstruction = async () => {
			if (pendingDelete === null) return;
			setDeleting(true);
			try {
				await callApi("/dsh-mcp-skill/agents/delete", { path: pendingDelete.path });
				setBanner({ kind: "ok", text: "已把 " + pendingDelete.name + " 移入回收站。" });
				setPendingDelete(null);
				await reload();
			} catch (error) {
				setBanner({ kind: "error", text: error && error.message ? error.message : String(error) });
				setPendingDelete(null);
			} finally {
				setDeleting(false);
			}
		};

		const reveal = async (slot) => {
			try {
				await callApi("/dsh-mcp-skill/agents/reveal", { path: slot.path });
			} catch (error) {
				setBanner({ kind: "error", text: error && error.message ? error.message : String(error) });
			}
		};

		const data = state.data;
		const global = data === null || data.global === undefined ? null : data.global;
		const workspaces = data !== null && Array.isArray(data.workspaces) ? data.workspaces : [];

		/** 一条已存在文件的卡片。 */
		const fileCard = (slot, role) => h("div", { className: "dmsm-card", key: slot.path },
			h("div", { className: "dmsm-card-main" },
				h("div", { className: "dmsm-row-title" },
					h("span", { className: "dmsm-name" }, slot.name),
					agentTags(slot, role),
					h(Tag, { tone: "quiet" }, formatBytes(slot.bytes))
				),
				h("div", { className: "dmsm-path" }, slot.path)
			),
			h("div", { className: "dmsm-actions" },
				h(ActionButton, {
					label: "编辑",
					title: "编辑内容",
					icon: h(IconEditOutlineRegular, { size: 14 }),
					onClick: () => setEditing(slot),
				}),
				h(ActionButton, {
					label: "定位",
					title: "在文件管理器中显示",
					icon: h(IconFolderOpenOutlineRegular, { size: 14 }),
					onClick: () => { void reveal(slot); },
				}),
				h(ActionButton, {
					label: "删除",
					title: "移入回收站",
					icon: h(IconTrashOutlineRegular, { size: 14 }),
					onClick: () => setPendingDelete(slot),
				})
			)
		);

		/** 还没建出来的槽位：点一下就开始写。 */
		const slotButton = (slot, role, label) => h("button", {
			type: "button",
			className: "dmsm-slot",
			key: slot.path,
			onClick: () => setEditing(slot),
		},
			h(IconPlusOutlineRegular, { size: 14 }),
			h("span", null, label)
		);

		const blocks = [];
		if (global !== null) {
			blocks.push(h("div", { className: "dmsm-group", key: "group-global" },
				h("span", { className: "dmsm-group-title" }, "全局"),
				h("span", { className: "dmsm-group-path" }, global.path)
			));
			blocks.push(global.exists
				? fileCard(global)
				: slotButton(global, undefined, "新建全局 AGENTS.md（对所有会话生效）"));
		}
		for (const workspace of workspaces) {
			blocks.push(h("div", { className: "dmsm-group", key: "group-" + workspace.id },
				h("span", { className: "dmsm-group-title" }, workspace.title),
				h("span", { className: "dmsm-group-path" }, workspace.path),
				workspace.exists === false ? h(Tag, { tone: "warning" }, "目录不存在") : null
			));
			for (const link of workspace.dirs) {
				const base = link.files.filter((file) => file.name === "AGENTS.md")[0];
				if (base !== undefined && base.exists !== true) {
					blocks.push(slotButton(base, link.role, "在" + roleLabel(link.role) + "新建 AGENTS.md"));
				}
				for (const file of link.files) {
					if (file.exists !== true) continue;
					blocks.push(fileCard(file, link.role));
				}
			}
		}
		if (workspaces.length === 0) {
			blocks.push(h("div", { className: "dmsm-hint", style: { padding: "8px 2px" } },
				"还没有登记工作区，所以只显示全局指令文件。"));
		}
		blocks.push(h("div", { className: "dmsm-roots", key: "foot-note" },
			"加载顺序：全局 → 项目根 → … → 工作目录；每层先 AGENTS.md / CLAUDE.md，再 AGENTS.local.md / CLAUDE.local.md。渲染预算 "
				+ formatBytes(data === null ? 0 : data.maxBytes) + "，" + formatBytes(data === null ? 0 : data.sourceBytes) + " 以上的单个文件会被跳过。"));

		const body = state.loading && data === null
			? h("div", { className: "dmsm-loading" }, "正在读取指令文件…")
			: state.error !== null
				? h("div", { className: "dmsm-empty" }, /(404|405)/.test(state.error)
					? "智能体个性管理需要新版宿主代码：重启一次应用后即可使用。"
					: "读取失败：" + state.error)
				: h("div", { className: "dmsm-body" }, blocks);

		return h(PageShell, {
			flat: flat,
			icon: h(IconListPenOutlineRegular, { size: 16 }),
			title: "智能体个性管理",
			subtitle: "AGENTS.md / CLAUDE.md 等指令文件 —— 决定智能体在全局与各工作区里怎么做事 · 改完从下一次请求生效",
			banner,
			actions: [
				h(ActionButton, {
					key: "refresh",
					label: "刷新",
					title: "重新读取",
					compact: true,
					icon: h(IconRefreshOutlineRegular, { size: 14 }),
					onClick: () => { setBanner(null); void reload(); },
				}),
			],
		},
			body,
			editing === null ? null : h(AgentEditorModal, {
				slot: editing,
				onClose: () => setEditing(null),
				onSaved: (existed) => {
					setEditing(null);
					setBanner({ kind: "ok", text: existed ? "已保存，下一次请求生效。" : "已创建，下一次请求生效。" });
					void reload();
				},
			}),
			pendingDelete === null ? null : h(Modal, {
				open: true,
				onClose: deleting ? () => {} : () => setPendingDelete(null),
				title: "删除指令文件",
				closeLabel: "关闭",
				className: "dmsm-modal",
				footer: h("div", { className: "dmsm-footer" },
					h("span", { className: "dmsm-footer-spacer" }),
					h(Button, { variant: "ghost", size: "md", onClick: () => setPendingDelete(null), disabled: deleting }, "取消"),
					h(Button, { variant: "primary", size: "md", onClick: removeInstruction, disabled: deleting }, deleting ? "删除中…" : "移入回收站")
				),
			},
				h("div", { className: "dmsm-desc" }, "「" + pendingDelete.name + "」会被移入回收站，随时可以从 ~/.dsh/dsh-peripherals/trash 取回。"),
				h("div", { className: "dmsm-path", style: { marginTop: 8 } }, pendingDelete.path)
			)
		);
	}
	//#endregion

	//#region 侧栏面板：外设
	/** 侧栏面板 id：既决定主栏内容（`main` 键），也是 `ctx.layout.selectPanel()` 的路由键。 */
	const PANEL_ID = "local-tools";

	/**
	 * 「外设」面板：主栏整页渲染，视觉与「插件」页一致。
	 *
	 * 它不再是设置分区，而是和「插件」并列的侧栏面板：
	 * `sidebar.panellist` 放图标（order 1，紧挨「插件」的 order 0），
	 * `main` 按 key 渲染整页内容，切页由 `ctx.layout.selectPanel('local-tools')` 完成。
	 */
	function LocalToolsPage({ remote }) {
		const [tab, setTab] = useState("mcp");
		const tabs = [
			{ value: "mcp", label: "MCP 服务器" },
			{ value: "skills", label: "技能" },
			{ value: "agents", label: "个性指令" },
		];
		return h("div", { className: "dmsm-panel" },
			h("header", { className: "dmsm-page-head", "data-window-drag": true },
				h("div", null,
					h("h1", { className: "dmsm-page-title" }, "外设"),
					h("div", { className: "dmsm-page-intro" }, "管理本机的 MCP 服务器、技能与智能体个性指令")
				)
			),
			h("div", { className: "dmsm-tabs" },
				h(SegmentedTabs, {
					items: tabs,
					value: tab,
					onChange: setTab,
					label: "外设",
				})
			),
			h("div", { className: "dmsm-tab-body" },
				tab === "mcp"
					? h(McpPage, { remote, flat: true })
					: tab === "skills"
						? h(SkillPage, { flat: true })
						: h(AgentsPage, { flat: true })
			)
		);
	}

	/** 侧栏面板列表里的图标（shell 传入 size / active）。 */
	function LocalToolsIcon({ size }) {
		return h(IconSlidersTwoOutlineRegular, { size: size === undefined ? 16 : size });
	}
	//#endregion

	//#region 页面级错误兜底
	/** 任一半侧抛错时保住设置面板，只在本页显示错误。 */
	class SectionBoundary extends react.Component {
		constructor(props) {
			super(props);
			this.state = { error: null };
		}
		static getDerivedStateFromError(error) {
			return { error };
		}
		render() {
			if (this.state.error !== null) {
				return h("div", { className: "dmsm-root" },
					h(Banner, { kind: "error", text: "页面渲染出错：" + (this.state.error && this.state.error.message ? this.state.error.message : String(this.state.error)) })
				);
			}
			return this.props.children;
		}
	}

	/**
	 * 把页面包进错误边界，并把 slot 注入的 props 原样转发（remote 等）。
	 *
	 * @param Page - 页面组件
	 * @returns 包装后的组件
	 */
	function guarded(Page) {
		return function Guarded(props) {
			return h(SectionBoundary, null, h(Page, props));
		};
	}
	//#endregion

	const name = "dsh-peripherals";
	/**
	 * 需要的客户端服务：slots 用来注册设置分区；remote.pluginManager 用来
	 * 直接调用官方的插件启停（MCP 服务器的启用 / 停用），不必自己改 YAML。
	 */
	const inject = ["slots", "remote", "remote.pluginManager"];

	/**
	 * 客户端入口：把「本地工具」注册成侧栏面板（不再是设置分区）。
	 *
	 * - `main`：按 key = PANEL_ID 渲染主栏整页，`ctx.layout.selectPanel('local-tools')` 即可路由过来；
	 * - `sidebar.panellist`：侧栏图标，order 1 让它紧跟在「插件」（order 0）后面。
	 *
	 * @param ctx - 客户端插件上下文
	 */
	function apply(ctx) {
		ensureCss();
		ctx.slots.inject("main", () => ctx.slots.register({
			name: "main",
			key: PANEL_ID,
			inject: () => ({ remote: ctx.remote }),
		}, guarded(LocalToolsPage)));
		ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
			name: "sidebar.panellist",
			id: PANEL_ID,
			order: 1,
			label: "外设",
		}, LocalToolsIcon));
	}

	exports.apply = apply;
	exports.inject = inject;
	exports.name = name;
	return module.exports;
}
});
