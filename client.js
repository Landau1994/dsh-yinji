/**
 * dsh-yinji — 「隐几」browser half.
 *
 * 纯客户端 UI 插件：接管右侧栏内置的「文件」标签页（kind `files`），在文件树里
 * 让用户按工作区隐藏选中的目录 / 文件。隐藏只作用于这棵树本身：宿主、模型工具、
 * @ 引用搜索与文件预览都不受影响。
 *
 * 形式与 dsh-inkstone 一致：手写 DSH client module（lazy-CJS）。执行本文件只向
 * `window.__ModuleLoader__` 注册一个惰性工厂；所有副作用都在工厂被 materialize
 * 之后、`apply(ctx)` 里发生。没有构建步骤。
 *
 * 接管方式（DSH 官方扩展点）：
 *   1. `ctx.sidebarRightTabs.register({ id, kind: 'files', priority: 'extension' })`
 *      —— 同一个 kind 上 extension 优先于 builtin；内置文件树的 type 被遮蔽但保留，
 *      本插件卸载后自动恢复。
 *   2. `ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name, key }, Body))`
 *      —— 在 type 自己的 id 下注册 body；Tab 按当前生效 type 的 id 分发。
 *   3. 我们的 definition 自带同样的 guide entry（`workspace`），所以右侧栏默认
 *      guide 页上的「工作区文件」入口仍然存在，点开落在我们的 body 上。
 *
 * 持久化：隐藏名单按「工作区根目录」存 `localStorage['dsh-yinji.v1']`，与 DSH 自己的
 * 右侧栏布局（localStorage）同一层，不写宿主配置、不产生宿主路由。
 *
 * 稳定 DOM 锚点（供 QA / 主题使用）：
 *   - `[data-dsh-yinji="root"]` / `[data-dsh-yinji-body]`
 *   - `[data-dsh-yinji-action="select|hidden|reload"]`
 *   - `[data-dsh-yinji-path]` / `[data-dsh-yinji-rel]`
 *   - `[data-dsh-yinji-manager]`
 */

;(function () {
  'use strict'

  /** 插件 / bundle 行 id；必须与 package.json 的 name 一致。 */
  const PACKAGE = 'dsh-yinji'
  /** 我们在右侧栏 type 注册表里的实现 id（不等于 kind）。 */
  const TYPE_ID = 'dsh-yinji/files'
  /** 被接管的页面 kind：内置「文件」标签页。 */
  const KIND = 'files'
  /** guide 入口 id：沿用内置文件树的 `workspace`，保持入口语义。 */
  const GUIDE_ENTRY_ID = 'workspace'
  /** localStorage key；版本化，方便以后迁移。 */
  const STORAGE_KEY = 'dsh-yinji.v1'
  /** 注入的 <style> id。 */
  const STYLE_ID = 'dsh-yinji/style'

  // ---------------------------------------------------------------------------
  // 文案（DSH desktop 是 zh-CN；非中文环境退回英文）
  // ---------------------------------------------------------------------------

  const ZH = {
    typeLabel: '文件',
    guideTitle: '工作区文件',
    guideDescription: '浏览会话工作区的文件，可隐藏不想看的项',
    loading: '正在读取…',
    empty: '空目录',
    allHidden: '这个目录的内容都已隐藏。',
    truncated: '条目太多，只显示了一部分。',
    noWorkspace: '这个会话没有工作区目录。',
    reload: '重新读取',
    hideItem: '隐藏此项',
    hiddenCount: '已隐藏 {n} 项',
    managerTitle: '已隐藏的项目',
    managerEmpty: '这个工作区还没有隐藏项。',
    managerHint: '只影响这棵文件树，不影响模型访问文件。',
    managerOpen: '管理',
    restore: '恢复显示',
    restoreAll: '全部恢复',
    selectMode: '选择要隐藏的项目',
    selectModeOn: '退出选择',
    selectedCount: '已选 {n} 项',
    hideSelected: '隐藏所选',
    cancel: '取消',
    hiddenInside: '此目录中有 {n} 项已隐藏',
    errNotFound: '这个目录不在了。可能已被移动或删除。',
    errOutside: '这个目录在工作区之外，侧栏不会读取它。',
    errNotDir: '这不是一个目录。',
    errUnavailable: '读取失败：{message}',

    // 左侧栏「工作区」选择性隐藏
    hideWorkspace: '隐藏此工作区',
    hideWorkspaceAria: '隐藏工作区 {name}',
    workspaceHiddenCount: '已隐藏 {n} 个工作区',
    workspaceManagerTitle: '已隐藏的工作区',
    workspaceManagerEmpty: '还没有隐藏的工作区。',
    workspaceManagerHint: '只影响左侧列表，不删除工作区或会话，也不影响模型访问。',
    workspaceRestore: '恢复显示',
    workspaceRestoreAria: '恢复工作区 {name}',
    workspaceRestoreAll: '全部恢复',
    workspaceManage: '管理',
    workspaceAllHidden: '工作区都已隐藏。',
    workspaceNoteCount: '已隐藏 {n} 个工作区',
  }

  const EN = {
    typeLabel: 'Files',
    guideTitle: 'Workspace files',
    guideDescription: 'Browse files in this workspace; hide the ones you do not want to see',
    loading: 'Reading…',
    empty: 'Empty directory',
    allHidden: 'Everything in this directory is hidden.',
    truncated: 'Too many entries; only some are shown.',
    noWorkspace: 'This session has no workspace directory.',
    reload: 'Reload',
    hideItem: 'Hide this item',
    hiddenCount: '{n} hidden',
    managerTitle: 'Hidden items',
    managerEmpty: 'Nothing is hidden in this workspace yet.',
    managerHint: 'This affects only this file tree, not the model\'s file access.',
    managerOpen: 'Manage',
    restore: 'Show again',
    restoreAll: 'Show all',
    selectMode: 'Select items to hide',
    selectModeOn: 'Exit selection',
    selectedCount: '{n} selected',
    hideSelected: 'Hide selected',
    cancel: 'Cancel',
    hiddenInside: '{n} hidden in this folder',
    errNotFound: 'That directory is gone. It may have been moved or deleted.',
    errOutside: 'That directory is outside the workspace, so the sidebar will not read it.',
    errNotDir: 'That is not a directory.',
    errUnavailable: 'Read failed: {message}',

    // Left sidebar workspace hiding
    hideWorkspace: 'Hide this workspace',
    hideWorkspaceAria: 'Hide workspace {name}',
    workspaceHiddenCount: '{n} workspaces hidden',
    workspaceManagerTitle: 'Hidden workspaces',
    workspaceManagerEmpty: 'No workspace is hidden yet.',
    workspaceManagerHint: 'This affects only the left list; it does not delete the workspace or its sessions, and the model is unaffected.',
    workspaceRestore: 'Show again',
    workspaceRestoreAria: 'Restore workspace {name}',
    workspaceRestoreAll: 'Show all',
    workspaceManage: 'Manage',
    workspaceAllHidden: 'All workspaces are hidden.',
    workspaceNoteCount: '{n} workspaces hidden',
  }

  function currentLanguage() {
    try {
      const lang = (typeof navigator !== 'undefined' && navigator.language) || 'zh'
      return /^zh/i.test(lang) ? 'zh' : 'en'
    } catch (error) {
      return 'zh'
    }
  }

  function messages() {
    return currentLanguage() === 'zh' ? ZH : EN
  }

  /** 极简 {name} 插值；缺变量时保留占位符。 */
  function format(text, vars) {
    if (!vars) return text
    return String(text).replace(/\{(\w+)\}/g, (match, key) => (
      vars[key] === undefined || vars[key] === null ? match : String(vars[key])
    ))
  }

  // ---------------------------------------------------------------------------
  // 纯函数（无 DOM / 无 React，便于 node 冒烟测试）
  // ---------------------------------------------------------------------------

  function normalizeSlashes(value) {
    return String(value === undefined || value === null ? '' : value).replace(/\\/g, '/')
  }

  /** 去掉尾部 `/`，根 `/` 与 Windows `C:/` 保留。 */
  function stripTrailingSlashes(value) {
    const text = normalizeSlashes(value)
    if (text === '/') return '/'
    if (/^[A-Za-z]:\/$/.test(text)) return text
    return text.replace(/\/+$/, '')
  }

  function isWindowsPath(value) {
    const text = normalizeSlashes(value)
    return /^[A-Za-z]:\//.test(text) || text.slice(0, 2) === '//'
  }

  /**
   * 路径比较键。`caseInsensitive` 显式给出时按它折叠大小写；未给出时按路径自身
   * 的 Windows 形态推断（对相对路径不可靠，组件里总是显式传入工作区根的类型）。
   */
  function comparisonKey(value, caseInsensitive) {
    const text = normalizeSlashes(value)
    const fold = caseInsensitive === undefined ? isWindowsPath(text) : caseInsensitive === true
    return fold ? text.toLowerCase() : text
  }

  /** 类 POSIX 的子路径拼接：宿主接受混合分隔符，树只需要稳定 key。 */
  function childPath(parent, name) {
    const base = stripTrailingSlashes(parent)
    return base.endsWith('/') ? base + String(name) : base + '/' + String(name)
  }

  /** 工作区的持久化 key：规范化大小写差异。 */
  function rootKeyOf(root) {
    const text = stripTrailingSlashes(root)
    return isWindowsPath(text) ? text.toLowerCase() : text
  }

  /** 绝对路径 → 相对工作区根的 `/` 路径；不在根下时原样返回。 */
  function relativePathOf(root, absolutePath) {
    const base = stripTrailingSlashes(root)
    const target = normalizeSlashes(absolutePath)
    const baseKey = comparisonKey(base)
    const targetKey = comparisonKey(target)
    if (targetKey === baseKey) return ''
    // 根为 `/` 或 `C:/` 时 base 自带尾部 `/`，不能再拼一个。
    const prefix = baseKey.endsWith('/') ? baseKey : baseKey + '/'
    if (targetKey.indexOf(prefix) === 0) return target.slice(prefix.length)
    return target
  }

  /** 隐藏名单里的一项：`/` 分隔，无首尾 `/`，无空段。 */
  function normalizeHiddenPath(value) {
    const text = normalizeSlashes(value).trim().replace(/^\/+/, '').replace(/\/+$/, '')
    if (text === '') return ''
    return text.split('/').filter(Boolean).join('/')
  }

  /** `relative` 是否被隐藏（自身或某个祖先在名单里）。 */
  function isHiddenPath(hidden, relative, caseInsensitive) {
    const key = comparisonKey(normalizeHiddenPath(relative), caseInsensitive)
    if (key === '') return false
    for (let index = 0; index < hidden.length; index += 1) {
      const entry = normalizeHiddenPath(hidden[index])
      if (entry === '') continue
      const entryKey = comparisonKey(entry, caseInsensitive)
      if (key === entryKey || key.indexOf(entryKey + '/') === 0) return true
    }
    return false
  }

  /** 某个可见目录下有多少个「顶层隐藏项」；用于行尾的小计数。 */
  function hiddenDescendantCount(hidden, relativeDir, caseInsensitive) {
    const key = comparisonKey(normalizeHiddenPath(relativeDir), caseInsensitive)
    const prefix = key === '' ? '' : key + '/'
    if (prefix === '') return 0
    let count = 0
    for (let index = 0; index < hidden.length; index += 1) {
      const entry = normalizeHiddenPath(hidden[index])
      if (entry === '') continue
      if (comparisonKey(entry, caseInsensitive).indexOf(prefix) === 0) count += 1
    }
    return count
  }

  /** 目录深度，用于「选了父目录就不再单列子项」。 */
  function depthOf(relative) {
    const text = normalizeHiddenPath(relative)
    return text === '' ? 0 : text.split('/').length
  }

  /** 去掉被祖先覆盖的选择，按深度 + 名称稳定排序。 */
  function normalizeSelection(list, caseInsensitive) {
    const sorted = list
      .map(normalizeHiddenPath)
      .filter((item) => item !== '')
      .sort((left, right) => depthOf(left) - depthOf(right) || left.localeCompare(right))
    const result = []
    for (const item of sorted) {
      const key = comparisonKey(item, caseInsensitive)
      const covered = result.some((kept) => {
        const keptKey = comparisonKey(kept, caseInsensitive)
        return key === keptKey || key.indexOf(keptKey + '/') === 0
      })
      if (!covered) result.push(item)
    }
    return result
  }

  /** 把新增隐藏项并入名单：祖先覆盖的旧项删除，新项去重。 */
  function mergeHidden(hidden, added, caseInsensitive) {
    const merged = normalizeSelection(listConcat(hidden, added), caseInsensitive)
    return merged.sort((left, right) => left.localeCompare(right))
  }

  function listConcat(left, right) {
    const result = []
    for (const item of left || []) result.push(item)
    for (const item of right || []) result.push(item)
    return result
  }

  /** 从名单里删掉某一项（只删自身，子项如果有会继续保留）。 */
  function removeHidden(hidden, relative, caseInsensitive) {
    const key = comparisonKey(normalizeHiddenPath(relative), caseInsensitive)
    return (hidden || [])
      .map(normalizeHiddenPath)
      .filter((item) => item !== '' && comparisonKey(item, caseInsensitive) !== key)
      .sort((left, right) => left.localeCompare(right))
  }

  // ---------------------------------------------------------------------------
  // 持久化（localStorage，按工作区根）
  // ---------------------------------------------------------------------------

  function emptyStore() {
    return { version: 1, roots: {} }
  }

  function readStore() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return emptyStore()
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || !parsed.roots || typeof parsed.roots !== 'object') return emptyStore()
      return { version: 1, roots: parsed.roots }
    } catch (error) {
      return emptyStore()
    }
  }

  function writeStore(store) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    } catch (error) {
      /* 隐私模式 / 配额满：隐藏功能退化为本次会话内有效。 */
    }
  }

  function readHidden(root) {
    if (!root) return []
    try {
      const store = readStore()
      const record = store.roots[rootKeyOf(root)]
      if (!record || !Array.isArray(record.hidden)) return []
      return record.hidden.map(normalizeHiddenPath).filter((item) => item !== '')
    } catch (error) {
      return []
    }
  }

  function writeHidden(root, hidden) {
    if (!root) return
    try {
      const store = readStore()
      const key = rootKeyOf(root)
      const list = (hidden || []).map(normalizeHiddenPath).filter((item) => item !== '')
      if (list.length === 0) delete store.roots[key]
      else store.roots[key] = { hidden: list }
      writeStore(store)
    } catch (error) {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------------------
  // 左侧栏：工作区隐藏的持久化（按 workspace id，与文件树名单分开）
  // ---------------------------------------------------------------------------

  const WORKSPACE_STORAGE_KEY = 'dsh-yinji.workspaces.v1'

  function emptyWorkspaceStore() {
    return { version: 1, hidden: {} }
  }

  function readWorkspaceStore() {
    try {
      const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
      if (!raw) return emptyWorkspaceStore()
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || !parsed.hidden || typeof parsed.hidden !== 'object') {
        return emptyWorkspaceStore()
      }
      const hidden = {}
      for (const id of Object.keys(parsed.hidden)) {
        if (typeof id !== 'string' || id === '') continue
        const record = parsed.hidden[id]
        const title = record && typeof record.title === 'string' ? record.title : ''
        hidden[id] = { title: title, hiddenAt: record && typeof record.hiddenAt === 'number' ? record.hiddenAt : 0 }
      }
      return { version: 1, hidden: hidden }
    } catch (error) {
      return emptyWorkspaceStore()
    }
  }

  function writeWorkspaceStore(store) {
    try {
      const hidden = {}
      for (const id of Object.keys((store && store.hidden) || {})) {
        const record = store.hidden[id]
        hidden[id] = { title: (record && record.title) || '', hiddenAt: (record && record.hiddenAt) || 0 }
      }
      if (Object.keys(hidden).length === 0) {
        window.localStorage.removeItem(WORKSPACE_STORAGE_KEY)
        return
      }
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ version: 1, hidden: hidden }))
    } catch (error) {
      /* 隐私模式 / 配额满：退化为本次页面内有效。 */
    }
  }

  /** 左侧栏工作区行的 key 形如 `workspace:<uuid>`；未分组桶等不是真实工作区。 */
  function isWorkspaceRowKey(key) {
    return typeof key === 'string' && /^workspace:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)
  }

  function workspaceIdOfRowKey(key) {
    return key.slice('workspace:'.length)
  }

  /** 把本地名单里新增 / 删除的一项合并成新 store（纯函数，便于测试）。 */
  function setWorkspaceHiddenInStore(store, id, title, hidden) {
    const next = { version: 1, hidden: Object.assign({}, store.hidden) }
    if (hidden) next.hidden[id] = { title: String(title || ''), hiddenAt: Date.now() }
    else delete next.hidden[id]
    return next
  }

  function clearWorkspacesInStore() {
    return emptyWorkspaceStore()
  }

  // ---------------------------------------------------------------------------
  // 文件地址 / 展示辅助
  // ---------------------------------------------------------------------------

  /** 与 @deepseek-ai/dsh-util-workspace-path 的 sessionFileAddress 同构。 */
  function encodeSegment(segment) {
    return encodeURIComponent(segment).replace(/%3A/gi, ':')
  }

  function sessionFileAddress(sessionId, relativePath) {
    const normalized = normalizeSlashes(relativePath).replace(/^(?:\.\/)+/, '')
    return 'dsh-resource://file/session/' + encodeSegment(sessionId) + '/' +
      normalized.split('/').map(encodeSegment).join('/')
  }

  const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

  /** 内置文件树的展示顺序：目录在前，再按自然、大小写不敏感名称。 */
  function orderEntries(entries) {
    return (entries || []).slice().sort((left, right) => {
      const group = Number(right.type === 'directory') - Number(left.type === 'directory')
      return group !== 0 ? group : nameCollator.compare(left.name, right.name)
    })
  }

  function basenameOf(relative) {
    const text = normalizeHiddenPath(relative)
    const index = text.lastIndexOf('/')
    return index === -1 ? text : text.slice(index + 1)
  }

  // ---------------------------------------------------------------------------
  // 样式
  // ---------------------------------------------------------------------------

  const CSS = `
[data-dsh-yinji="root"] { display:flex; flex:1 1 auto; flex-direction:column; height:100%; min-height:0; position:relative; color:var(--dsw-alias-label-primary); font-size:var(--dsh-content-font-size-secondary,13px); line-height:1.5; }
[data-dsh-yinji="root"] .y-header { display:flex; flex:0 0 auto; gap:2px; align-items:center; box-sizing:border-box; height:38px; padding:0 6px 0 16px; border-bottom:0.5px solid var(--dsw-alias-border-l3); }
[data-dsh-yinji="root"] .y-path { margin-right:8px; font-size:12px; }
[data-dsh-yinji="root"] .y-pathplain { flex:1 1 auto; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; color:var(--dsw-alias-label-secondary); }
[data-dsh-yinji="root"] .y-tool { display:inline-flex; flex:none; align-items:center; justify-content:center; width:28px; height:28px; padding:6px; color:var(--dsw-alias-label-secondary); line-height:1; background:transparent; border:none; border-radius:28px; cursor:pointer; }
[data-dsh-yinji="root"] .y-tool svg { width:15px; height:15px; }
[data-dsh-yinji="root"] .y-tool:hover { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-interactive-bg-hover); }
[data-dsh-yinji="root"] .y-tool.y-on { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-button-ghost-active-fill); }
[data-dsh-yinji="root"] .y-toolwithcount { width:auto; min-width:28px; gap:3px; padding:6px 7px; border-radius:14px; }
[data-dsh-yinji="root"] .y-count { font-size:11px; line-height:1; font-variant-numeric:tabular-nums; }
[data-dsh-yinji="root"] .y-body { flex:1 1 auto; min-height:0; margin-right:2px; padding:8px 0 8px 8px; overflow:auto; scrollbar-gutter:stable; }
[data-dsh-yinji="root"] .y-body::-webkit-scrollbar-track { margin:2px; }
[data-dsh-yinji="root"] .y-level { margin:0; padding:0; list-style:none; }
[data-dsh-yinji="root"] .y-level .y-level { padding-left:18px; }
[data-dsh-yinji="root"] .y-item { margin:0; padding:0; }
[data-dsh-yinji="root"] .y-rowwrap { position:relative; display:flex; align-items:center; border-radius:10px; }
[data-dsh-yinji="root"] .y-rowwrap:hover { background:var(--dsw-alias-interactive-bg-hover); }
[data-dsh-yinji="root"] .y-row { display:flex; gap:6px; align-items:center; width:100%; min-width:0; padding:5px 34px 5px 10px; color:inherit; font:inherit; text-align:left; background:transparent; border:0; border-radius:10px; cursor:pointer; }
[data-dsh-yinji="root"] .y-row:hover { background:transparent; }
[data-dsh-yinji="root"] .y-row:focus-visible { outline:2px solid var(--dsw-alias-state-business-primary); outline-offset:-2px; }
[data-dsh-yinji="root"] .y-selected { background:var(--dsw-alias-button-ghost-active-fill); }
[data-dsh-yinji="root"] .y-row.y-selected:hover { background:var(--dsw-alias-button-ghost-active-fill); }
[data-dsh-yinji="root"] .y-icon { flex:none; color:var(--dsw-alias-label-tertiary); }
[data-dsh-yinji="root"] .y-fileicon { flex:none; }
[data-dsh-yinji="root"] .y-name { min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
[data-dsh-yinji="root"] .y-other { color:var(--dsw-alias-label-tertiary); cursor:default; }
[data-dsh-yinji="root"] .y-checkbox { flex:none; display:inline-flex; align-items:center; justify-content:center; width:15px; height:15px; box-sizing:border-box; border:1.2px solid color-mix(in srgb, var(--dsw-alias-label-tertiary) 70%, transparent); border-radius:4px; color:var(--dsw-alias-label-primary-foreground); background:transparent; }
[data-dsh-yinji="root"] .y-checkbox[data-checked="true"] { border-color:var(--dsw-alias-brand-primary); background:var(--dsw-alias-brand-primary); }
[data-dsh-yinji="root"] .y-badge { flex:none; margin-left:auto; padding:1px 6px; border-radius:9px; font-size:11px; line-height:1.4; color:var(--dsw-alias-label-tertiary); background:var(--dsw-alias-button-ghost-active-fill); }
[data-dsh-yinji="root"] .y-hide { position:absolute; right:4px; top:50%; transform:translateY(-50%); display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; padding:0; color:var(--dsw-alias-label-tertiary); background:transparent; border:0; border-radius:12px; cursor:pointer; opacity:0; transition:opacity 0.12s ease; }
[data-dsh-yinji="root"] .y-rowwrap:hover .y-hide, [data-dsh-yinji="root"] .y-hide:focus-visible { opacity:1; }
[data-dsh-yinji="root"] .y-hide:hover { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-interactive-bg-hover); }
[data-dsh-yinji="root"] .y-note { margin:0; padding:3px 10px; color:var(--dsw-alias-label-tertiary); font-size:12px; }
[data-dsh-yinji="root"] .y-noteactions { display:flex; gap:8px; align-items:center; }
[data-dsh-yinji="root"] .y-link { padding:0; color:var(--dsw-alias-link); font:inherit; font-size:12px; background:none; border:0; cursor:pointer; }
[data-dsh-yinji="root"] .y-link:hover { text-decoration:underline; text-underline-offset:2px; }
[data-dsh-yinji="root"] .y-status { display:flex; flex-direction:column; padding:12px 10px; }
[data-dsh-yinji="root"] .y-statusline { margin:0; color:var(--dsw-alias-label-secondary); font-size:var(--dsh-content-font-size-secondary,13px); line-height:1.6; }
[data-dsh-yinji="root"] .y-selbar { display:flex; flex:0 0 auto; gap:8px; align-items:center; padding:8px 10px; border-top:0.5px solid var(--dsw-alias-border-l3); }
[data-dsh-yinji="root"] .y-selcount { flex:1 1 auto; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:12px; color:var(--dsw-alias-label-secondary); }
[data-dsh-yinji="root"] .y-btn { padding:3px 10px; font:inherit; font-size:12px; color:var(--dsw-alias-label-primary); background:transparent; border:0.5px solid color-mix(in srgb, var(--dsw-alias-label-tertiary) 55%, transparent); border-radius:8px; cursor:pointer; }
[data-dsh-yinji="root"] .y-btn:hover { background:var(--dsw-alias-interactive-bg-hover); }
[data-dsh-yinji="root"] .y-btn:disabled { opacity:0.45; cursor:default; }
[data-dsh-yinji="root"] .y-btnprimary { color:var(--dsw-alias-label-primary-foreground); background:var(--dsw-alias-button-primary-fill); border-color:transparent; }
[data-dsh-yinji="root"] .y-btnprimary:not(:disabled):hover { background:var(--dsw-alias-button-primary-hover); }
[data-dsh-yinji="root"] .y-popover { position:absolute; top:38px; right:6px; z-index:40; box-sizing:border-box; width:min(248px,calc(100% - 12px)); max-height:calc(100% - 48px); display:flex; flex-direction:column; padding:6px; border-radius:16px; background:var(--dsw-specific-menu); backdrop-filter:var(--dsw-menu-backdrop-filter); box-shadow:var(--dsw-elevation-prominent); }
[data-dsh-yinji="root"] .y-pophead { display:flex; gap:8px; align-items:center; padding:4px 8px 6px; }
[data-dsh-yinji="root"] .y-poptitle { flex:1 1 auto; min-width:0; font-size:12px; font-weight:500; color:var(--dsw-alias-label-primary); }
[data-dsh-yinji="root"] .y-pophint { padding:6px 8px 2px; font-size:11px; color:var(--dsw-alias-label-tertiary); }
[data-dsh-yinji="root"] .y-pophint:empty { display:none; }
[data-dsh-yinji="root"] .y-poplist { min-height:0; overflow:auto; }
[data-dsh-yinji="root"] .y-poplist .y-note { padding:4px 8px; }
[data-dsh-yinji="root"] .y-managerrow { display:flex; gap:8px; align-items:center; padding:4px 8px; border-radius:8px; }
[data-dsh-yinji="root"] .y-managerrow:hover { background:var(--dsw-alias-interactive-bg-hover); }
[data-dsh-yinji="root"] .y-managerpath { display:flex; flex:1 1 auto; min-width:0; gap:4px; align-items:baseline; font-size:12px; }
[data-dsh-yinji="root"] .y-managerdir { min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; color:var(--dsw-alias-label-tertiary); }
[data-dsh-yinji="root"] .y-managername { flex:none; max-width:140px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; color:var(--dsw-alias-label-primary); }
[data-dsh-yinji="root"] .y-restore { flex:none; display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; padding:0; color:var(--dsw-alias-label-tertiary); background:transparent; border:0; border-radius:11px; cursor:pointer; }
[data-dsh-yinji="root"] .y-restore:hover { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-interactive-bg-hover); }
[data-dsh-yinji="root"] .y-restore svg { width:13px; height:13px; }

/* 左侧栏「工作区」选择性隐藏：注入的按钮 / 管理弹层 / 全隐藏提示。 */
.dsh-yinji-ws-tool { display:inline-flex; flex:none; align-items:center; justify-content:center; width:28px; height:28px; padding:0; color:var(--dsw-alias-label-secondary); background:transparent; border:none; border-radius:var(--dsw-radius-sm,8px); cursor:pointer; }
.dsh-yinji-ws-tool:hover { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-interactive-bg-hover); }
.dsh-yinji-ws-tool:focus-visible { outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary)); outline-offset:-2px; }
.dsh-yinji-ws-tool svg { width:16px; height:16px; }
.dsh-yinji-ws-manager { gap:2px; width:auto; min-width:28px; padding:0 6px; }
.dsh-yinji-ws-manager[aria-expanded="true"] { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-button-ghost-active-fill); }
.dsh-yinji-ws-count { font-size:11px; line-height:1; font-variant-numeric:tabular-nums; }
.dsh-yinji-ws-popover { position:fixed; z-index:1100; box-sizing:border-box; width:248px; max-height:60vh; display:flex; flex-direction:column; padding:6px; border-radius:16px; background:var(--dsw-specific-menu); backdrop-filter:var(--dsw-menu-backdrop-filter); box-shadow:var(--dsw-elevation-prominent); color:var(--dsw-alias-label-primary); font-size:13px; line-height:1.5; --dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2); }
.dsh-yinji-ws-pophead { display:flex; gap:8px; align-items:center; padding:4px 8px 6px; }
.dsh-yinji-ws-poptitle { flex:1 1 auto; min-width:0; font-size:12px; font-weight:500; }
.dsh-yinji-ws-link { flex:none; padding:0; color:var(--dsw-alias-link); font:inherit; font-size:12px; background:none; border:0; cursor:pointer; }
.dsh-yinji-ws-link:hover { text-decoration:underline; text-underline-offset:2px; }
.dsh-yinji-ws-poplist { min-height:0; overflow:auto; }
.dsh-yinji-ws-poprow { display:flex; gap:8px; align-items:center; padding:4px 8px; border-radius:8px; }
.dsh-yinji-ws-poprow:hover { background:var(--dsw-alias-interactive-bg-hover); }
.dsh-yinji-ws-poptitletext { flex:1 1 auto; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:12px; }
.dsh-yinji-ws-restore { flex:none; display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; padding:0; color:var(--dsw-alias-label-tertiary); background:transparent; border:0; border-radius:11px; cursor:pointer; }
.dsh-yinji-ws-restore:hover { color:var(--dsw-alias-label-primary); background:var(--dsw-alias-interactive-bg-hover); }
.dsh-yinji-ws-restore svg { width:13px; height:13px; }
.dsh-yinji-ws-pophint { padding:6px 8px 2px; font-size:11px; line-height:1.6; color:var(--dsw-alias-label-tertiary); }
.dsh-yinji-ws-empty { padding:4px 8px; font-size:12px; color:var(--dsw-alias-label-tertiary); }
.dsh-yinji-ws-note { display:flex; gap:8px; align-items:center; margin:2px 0 6px; padding:4px 8px; font-size:12px; line-height:1.6; color:var(--dsw-alias-label-tertiary); }
`

  function ensureStyles() {
    try {
      if (document.getElementById(STYLE_ID)) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      ;(document.head || document.documentElement).appendChild(style)
    } catch (error) {
      /* 样式注入失败不影响功能，只是外观退化。 */
    }
  }

  // ---------------------------------------------------------------------------
  // body 组件（React）
  // ---------------------------------------------------------------------------

  /**
   * guide 卡片图标：0.2.x 的 primitives 提供 GuideArtworkFiles；旧版退回文件夹图标。
   * @param {object} primitives - 可能为 null。
   * @param {object} React - react module。
   * @returns {Function|undefined} guide entry 的 icon。
   */
  function guideIcon(primitives, React) {
    if (!primitives) return undefined
    if (typeof primitives.GuideArtworkFiles === 'function') return primitives.GuideArtworkFiles
    if (primitives.FileTypeIcon) {
      return function FolderIcon(props) {
        return React.createElement(primitives.FileTypeIcon, {
          kind: 'folder',
          size: props && props.size,
          className: props && props.className,
        })
      }
    }
    return undefined
  }

  /**
   * 构造 body 组件。组件只依赖框架给的 props（sessionId / useSessions / useTabInfo）
   * 与闭包里的 ctx.remote；不注册 slot store，展开状态用模块级 cache 按 tab 保存。
   * @param {object} ctx - client Cordis context。
   * @param {object} React - react module。
   * @param {object} primitives - dsh-client-ui-primitives（可能缺省）。
   * @returns {Function} React 组件。
   */
  function createFilesBody(ctx, React, primitives) {
    const h = React.createElement
    const useState = React.useState
    const useEffect = React.useEffect
    const useLayoutEffect = React.useLayoutEffect
    const useRef = React.useRef
    const useCallback = React.useCallback

    const P = primitives || {}
    const FileTypeIcon = P.FileTypeIcon
    const classifyFileType = typeof P.classifyFileType === 'function' ? P.classifyFileType : function () { return 'other' }
    const PathLabel = P.PathLabel
    const IconFolderOpenRegular = P.IconFolderOpenRegular
    const IconFolderCloseRegular = P.IconFolderCloseRegular
    const IconRefreshOutlineRegular = P.IconRefreshOutlineRegular
    const IconChecklistOutlineRegular = P.IconChecklistOutlineRegular
    const IconCheckOutlineRegular = P.IconCheckOutlineRegular
    const IconCloseOutlineRegular = P.IconCloseOutlineRegular

    /** 行尾「隐藏此项」的眼睛划斜线图标（产品图标集里没有 eye-off）。 */
    function EyeOffGlyph(props) {
      const size = (props && props.size) || 15
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        'aria-hidden': 'true', stroke: 'currentColor', strokeWidth: 1.1,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }, [
        h('path', { key: 'eye', d: 'M1.6 8s2.25-4 6.4-4 6.4 4 6.4 4-2.25 4-6.4 4S1.6 8 1.6 8Z' }),
        h('circle', { key: 'pupil', cx: 8, cy: 8, r: 1.75 }),
        h('path', { key: 'slash', d: 'M2.4 13.6 13.6 2.4' }),
      ])
    }

    function CheckboxGlyph(props) {
      const checked = props && props.checked === true
      return h('span', { className: 'y-checkbox', 'data-checked': checked ? 'true' : 'false', 'aria-hidden': 'true' },
        checked && IconCheckOutlineRegular ? h(IconCheckOutlineRegular, { size: 11 }) : null)
    }

    /**
     * 按 tab 缓存视图状态：右侧栏切换标签 / 面板折叠时 body 会卸载，
     * 没有 slot store 也能保留展开、滚动、隐藏管理等状态。
     */
    const tabStateCache = new Map()
    /** 按 tab 缓存滚动位置（不进入 state，避免滚动触发重渲染）。 */
    const tabScrollCache = new Map()

    function freshState(root) {
      return {
        root: root || null,
        levels: {},
        expanded: root ? [root] : [],
        hidden: root ? readHidden(root) : [],
        selectMode: false,
        selected: [],
        managerOpen: false,
      }
    }

    /** 失败行的文案（与内置文件树同构）。 */
    function failureLine(failure, t) {
      const code = failure && failure.code
      if (code === 'workspace-file/not-found') return t('errNotFound')
      if (code === 'workspace-file/outside-workspace') return t('errOutside')
      if (code === 'workspace-file/not-directory') return t('errNotDir')
      const message = (failure && failure.message) || 'unknown'
      return t('errUnavailable', { message: message })
    }

    /** 合并 setState：patch 可以是对象或 (prev) => 部分状态。 */
    function updateState(setState, patch) {
      setState((prev) => Object.assign({}, prev, typeof patch === 'function' ? patch(prev) : patch))
    }

    return function FilesBody(props) {
      const sessionId = props.sessionId
      const useSessions = props.useSessions
      const useTabInfo = props.useTabInfo

      // 这些 hooks 的顺序必须稳定：全部放在组件顶层。
      const tabInfo = useTabInfo()
      const tab = tabInfo.tab
      const signal = tab.signal
      const tabActions = tab.actions
      const cwd = useSessions((sessions) => {
        const session = sessions && sessions.byId ? sessions.byId[sessionId] : undefined
        return session ? session.cwd : undefined
      })

      const cached = tabStateCache.get(tab.id)
      const statePair = useState(() => (cached !== undefined ? cached : freshState(cwd)))
      const state = statePair[0]
      const setState = statePair[1]

      const rootRef = useRef(null)
      const bodyRef = useRef(null)
      const generationsRef = useRef(new Map())
      const watchesRef = useRef(new Map())

      const update = useCallback((patch) => {
        updateState(setState, patch)
      }, [])

      // 加载一个目录（目录级 listing，不做递归）。
      const load = useCallback((path) => {
        if (!sessionId || typeof path !== 'string' || path === '') return
        const generations = generationsRef.current
        const generation = (generations.get(path) || 0) + 1
        generations.set(path, generation)
        setState((prev) => {
          const current = prev.levels[path]
          if (current !== undefined && current.status === 'ready') return prev
          const levels = Object.assign({}, prev.levels)
          levels[path] = { status: 'loading' }
          return Object.assign({}, prev, { levels: levels })
        })
        let pending
        try {
          pending = ctx.remote.workspaceFiles.list(sessionId, path, signal)
        } catch (error) {
          pending = Promise.reject(error)
        }
        Promise.resolve(pending).then((result) => {
          if (signal.aborted || generations.get(path) !== generation) return
          setState((prev) => {
            const levels = Object.assign({}, prev.levels)
            if (result && result.ok) {
              levels[path] = {
                status: 'ready',
                entries: Array.isArray(result.value && result.value.entries) ? result.value.entries : [],
                truncated: Boolean(result.value && result.value.truncated),
              }
            } else {
              levels[path] = { status: 'failed', failure: (result && result.error) || { code: 'gateway/internal', message: 'unknown' } }
            }
            return Object.assign({}, prev, { levels: levels })
          })
        }, (error) => {
          if (signal.aborted || generations.get(path) !== generation) return
          setState((prev) => {
            const levels = Object.assign({}, prev.levels)
            levels[path] = { status: 'failed', failure: { code: 'gateway/internal', message: String((error && error.message) || error) } }
            return Object.assign({}, prev, { levels: levels })
          })
        })
      }, [sessionId, signal, setState])

      // 会话 cwd 就绪 / 变化：重建这一 tab 的树。
      useEffect(() => {
        if (!cwd) return
        if (state.root === cwd) return
        const next = freshState(cwd)
        tabStateCache.set(tab.id, next)
        setState(next)
      }, [cwd, state.root, tab.id, setState])

      // 缓存当前视图状态，供本 tab 重新挂载时恢复。
      useEffect(() => {
        tabStateCache.set(tab.id, state)
      }, [state, tab.id])

      // tab 真正关闭（signal abort）时清掉缓存。
      useEffect(() => {
        if (!signal || typeof signal.addEventListener !== 'function') return undefined
        const onAbort = () => {
          tabStateCache.delete(tab.id)
          tabScrollCache.delete(tab.id)
          const watches = watchesRef.current
          watches.forEach((entry) => { try { entry.stop() } catch (error) { /* ignore */ } })
          watches.clear()
        }
        signal.addEventListener('abort', onAbort)
        return () => { signal.removeEventListener('abort', onAbort) }
      }, [signal, tab.id])

      // 展开的目录若还没有 listing，就补一次。
      useEffect(() => {
        if (!state.root) return
        for (const path of state.expanded) {
          if (state.levels[path] === undefined) load(path)
        }
      }, [state.root, state.expanded, state.levels, load])

      // 自动刷新：为每个展开的目录挂一个 direct-entry watch。
      useEffect(() => {
        const remote = ctx.remote
        if (!state.root || !remote || typeof remote.$stream !== 'function') return undefined
        const watches = watchesRef.current
        const wanted = new Set(state.expanded)
        watches.forEach((entry, path) => {
          if (!wanted.has(path)) {
            try { entry.stop() } catch (error) { /* ignore */ }
            watches.delete(path)
          }
        })
        for (const path of state.expanded) {
          if (watches.has(path)) continue
          try {
            const stream = remote.$stream({
              name: 'dsh-yinji directory ' + path,
              open: (lifetime) => remote.workspaceFiles.changes(sessionId, path, lifetime),
              ended: () => new Error('dsh-yinji directory watch ended'),
            })
            const entry = {
              stop: () => { try { void stream.dispose() } catch (error) { /* ignore */ } },
            }
            watches.set(path, entry)
            ;(async () => {
              try {
                for await (const item of stream) {
                  try { item.accept() } catch (error) { /* ignore */ }
                  if (item && item.value && item.value.kind === 'change') load(path)
                }
              } catch (error) {
                /* watch-unsupported / 连接结束：静默退化为手动刷新。 */
              }
              if (watches.get(path) === entry) watches.delete(path)
            })()
          } catch (error) {
            /* 不支持 watch 的载体：保持手动刷新。 */
          }
        }
        return undefined
      }, [state.root, state.expanded, sessionId, load])

      // 弹层：点外关闭 / Esc 关闭。
      useEffect(() => {
        if (!state.managerOpen) return undefined
        const onPointerDown = (event) => {
          const root = rootRef.current
          if (root && !root.contains(event.target)) update({ managerOpen: false })
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') update({ managerOpen: false })
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown, true)
        }
      }, [state.managerOpen, update])

      // 恢复这一 tab 上次的滚动位置。
      useLayoutEffect(() => {
        if (bodyRef.current && tabScrollCache.has(tab.id)) bodyRef.current.scrollTop = tabScrollCache.get(tab.id)
      }, [tab.id])

      if (!cwd) {
        return h('div', { className: 'y-status', 'data-dsh-yinji': 'root', 'data-dsh-yinji-state': 'no-workspace' },
          [h('p', { key: 'line', className: 'y-statusline' }, messages().noWorkspace)])
      }

      const t = (key, vars) => format((messages()[key] || key), vars)
      /** 工作区在 Windows 上时，隐藏名单按大小写不敏感匹配。 */
      const caseInsensitive = isWindowsPath(state.root)

      const toggleExpand = (absolutePath) => {
        update((prev) => {
          const index = prev.expanded.indexOf(absolutePath)
          const expanded = index === -1
            ? prev.expanded.concat([absolutePath])
            : prev.expanded.slice(0, index).concat(prev.expanded.slice(index + 1))
          return { expanded: expanded }
        })
      }

      const openFile = (relativePath) => {
        try { tabActions.openResource(sessionFileAddress(sessionId, relativePath)) } catch (error) { /* ignore */ }
      }

      const hideOne = (relativePath) => {
        const nextHidden = mergeHidden(state.hidden, [relativePath], caseInsensitive)
        writeHidden(state.root, nextHidden)
        update({ hidden: nextHidden })
      }

      const restoreOne = (relativePath) => {
        const nextHidden = removeHidden(state.hidden, relativePath, caseInsensitive)
        writeHidden(state.root, nextHidden)
        update({ hidden: nextHidden })
      }

      const restoreAll = () => {
        writeHidden(state.root, [])
        update({ hidden: [] })
      }

      const toggleSelected = (relativePath) => {
        update((prev) => {
          const index = prev.selected.indexOf(relativePath)
          const selected = index === -1
            ? prev.selected.concat([relativePath])
            : prev.selected.slice(0, index).concat(prev.selected.slice(index + 1))
          return { selected: selected }
        })
      }

      const applySelection = () => {
        const chosen = normalizeSelection(state.selected, caseInsensitive)
        if (chosen.length === 0) return
        const nextHidden = mergeHidden(state.hidden, chosen, caseInsensitive)
        writeHidden(state.root, nextHidden)
        update({ hidden: nextHidden, selected: [], selectMode: false })
      }

      const toggleSelectMode = () => {
        update((prev) => ({ selectMode: !prev.selectMode, selected: [] }))
      }

      const reload = () => {
        const generations = generationsRef.current
        generations.clear()
        update({ levels: {} })
      }

      const onScroll = (event) => {
        tabScrollCache.set(tab.id, event.currentTarget.scrollTop)
      }

      // ---- 渲染 ----

      function renderHeader() {
        const children = []
        if (PathLabel) {
          children.push(h(PathLabel, { key: 'path', path: state.root || '', className: 'y-path', 'data-dsh-yinji-path': '' }))
        } else {
          children.push(h('span', { key: 'path', className: 'y-path y-pathplain', title: state.root || '' }, state.root || ''))
        }
        children.push(h('button', {
          key: 'select',
          type: 'button',
          className: 'y-tool' + (state.selectMode ? ' y-on' : ''),
          title: state.selectMode ? t('selectModeOn') : t('selectMode'),
          'aria-label': state.selectMode ? t('selectModeOn') : t('selectMode'),
          'aria-pressed': state.selectMode ? 'true' : 'false',
          onClick: toggleSelectMode,
          'data-dsh-yinji-action': 'select',
        }, IconChecklistOutlineRegular ? h(IconChecklistOutlineRegular) : h('span', null, '☑')))
        if (state.hidden.length > 0) {
          children.push(h('button', {
            key: 'hidden',
            type: 'button',
            className: 'y-tool y-toolwithcount' + (state.managerOpen ? ' y-on' : ''),
            title: t('hiddenCount', { n: state.hidden.length }),
            'aria-label': t('hiddenCount', { n: state.hidden.length }),
            'aria-expanded': state.managerOpen ? 'true' : 'false',
            onClick: () => { update((prev) => ({ managerOpen: !prev.managerOpen })) },
            'data-dsh-yinji-action': 'hidden',
          }, [EyeOffGlyph({ key: 'glyph', size: 15 }), h('span', { key: 'count', className: 'y-count' }, String(state.hidden.length))]))
        }
        children.push(h('button', {
          key: 'reload',
          type: 'button',
          className: 'y-tool',
          title: t('reload'),
          'aria-label': t('reload'),
          onClick: reload,
          'data-dsh-yinji-action': 'reload',
        }, IconRefreshOutlineRegular ? h(IconRefreshOutlineRegular) : h('span', null, '↻')))
        return h('div', { key: 'header', className: 'y-header' }, children)
      }

      function renderEntry(item) {
        const entry = item.entry
        const absolutePath = item.absolutePath
        const relativePath = item.relativePath
        const isDirectory = entry.type === 'directory'
        const expanded = state.expanded.indexOf(absolutePath) !== -1
        const selected = state.selected.indexOf(relativePath) !== -1
        const hiddenInside = isDirectory ? hiddenDescendantCount(state.hidden, relativePath, caseInsensitive) : 0

        const rowChildren = []
        if (state.selectMode) rowChildren.push(CheckboxGlyph({ key: 'check', checked: selected }))
        if (isDirectory) {
          rowChildren.push(expanded
            ? h(IconFolderOpenRegular, { key: 'icon', className: 'y-icon' })
            : h(IconFolderCloseRegular, { key: 'icon', className: 'y-icon' }))
        } else if (entry.type === 'file' && FileTypeIcon) {
          rowChildren.push(h(FileTypeIcon, { key: 'icon', kind: classifyFileType(entry.name), size: 16, className: 'y-fileicon' }))
        }
        rowChildren.push(h('span', { key: 'name', className: 'y-name' }, entry.name))
        if (hiddenInside > 0) {
          rowChildren.push(h('span', { key: 'badge', className: 'y-badge', title: t('hiddenInside', { n: hiddenInside }) }, String(hiddenInside)))
        }

        const rowClass = 'y-row' + (selected ? ' y-selected' : '') + (entry.type === 'other' ? ' y-other' : '')
        const rows = [h('button', {
          key: 'row',
          type: 'button',
          className: rowClass,
          'aria-expanded': isDirectory ? (expanded ? 'true' : 'false') : undefined,
          title: entry.name,
          onClick: () => {
            if (state.selectMode) {
              toggleSelected(relativePath)
              return
            }
            if (isDirectory) toggleExpand(absolutePath)
            else if (entry.type === 'file') openFile(relativePath)
          },
        }, rowChildren)]

        if (!state.selectMode && entry.type !== 'other') {
          rows.push(h('button', {
            key: 'hide',
            type: 'button',
            className: 'y-hide',
            title: t('hideItem'),
            'aria-label': t('hideItem') + '：' + entry.name,
            onClick: (event) => {
              event.stopPropagation()
              hideOne(relativePath)
            },
            'data-dsh-yinji-action': 'hide',
          }, EyeOffGlyph({ size: 14 })))
        }

        const children = [h('div', { key: 'wrap', className: 'y-rowwrap' }, rows)]
        if (isDirectory && expanded) {
          children.push(h('ul', { key: 'level', className: 'y-level' }, renderLevel(absolutePath)))
        }
        return h('li', {
          key: absolutePath,
          className: 'y-item',
          'data-dsh-yinji-entry': entry.type,
          'data-dsh-yinji-path': absolutePath,
          'data-dsh-yinji-rel': relativePath,
        }, children)
      }

      function renderLevel(absolutePath) {
        const level = state.levels[absolutePath]
        if (level === undefined || level.status === 'loading') {
          return [h('li', { key: 'loading', className: 'y-note', 'data-dsh-yinji-row': 'loading' }, t('loading'))]
        }
        if (level.status === 'failed') {
          return [h('li', {
            key: 'failed',
            className: 'y-note',
            'data-dsh-yinji-row': 'failed',
            'data-dsh-yinji-code': (level.failure && level.failure.code) || '',
          }, failureLine(level.failure, t))]
        }

        const entries = orderEntries(level.entries)
        const visible = []
        for (const entry of entries) {
          const absoluteChild = childPath(absolutePath, entry.name)
          const relativeChild = relativePathOf(state.root, absoluteChild)
          if (!isHiddenPath(state.hidden, relativeChild, caseInsensitive)) {
            visible.push({ entry: entry, absolutePath: absoluteChild, relativePath: relativeChild })
          }
        }

        const nodes = []
        if (entries.length === 0) {
          nodes.push(h('li', { key: 'empty', className: 'y-note', 'data-dsh-yinji-row': 'empty' }, t('empty')))
        } else if (visible.length === 0) {
          nodes.push(h('li', { key: 'all-hidden', className: 'y-note y-noteactions', 'data-dsh-yinji-row': 'all-hidden' }, [
            h('span', { key: 'text' }, t('allHidden')),
            h('button', { key: 'manage', type: 'button', className: 'y-link', onClick: () => { update({ managerOpen: true }) } }, t('managerOpen')),
          ]))
        }
        for (const item of visible) nodes.push(renderEntry(item))
        if (level.truncated) {
          nodes.push(h('li', { key: 'truncated', className: 'y-note', 'data-dsh-yinji-row': 'truncated' }, t('truncated')))
        }
        return nodes
      }

      function renderSelectionBar() {
        const count = normalizeSelection(state.selected, caseInsensitive).length
        return h('div', { key: 'selbar', className: 'y-selbar', 'data-dsh-yinji-selectbar': '' }, [
          h('span', { key: 'count', className: 'y-selcount' }, t('selectedCount', { n: count })),
          h('button', {
            key: 'apply',
            type: 'button',
            className: 'y-btn y-btnprimary',
            disabled: count === 0,
            onClick: applySelection,
            'data-dsh-yinji-action': 'hide-selected',
          }, t('hideSelected')),
          h('button', {
            key: 'cancel',
            type: 'button',
            className: 'y-btn',
            onClick: () => { update({ selectMode: false, selected: [] }) },
            'data-dsh-yinji-action': 'cancel-selection',
          }, t('cancel')),
        ])
      }

      function renderManager() {
        const hidden = state.hidden.slice().sort((left, right) => left.localeCompare(right))
        const rows = hidden.map((relativePath) => {
          const name = basenameOf(relativePath)
          const directory = relativePath.slice(0, Math.max(0, relativePath.length - name.length)).replace(/\/$/, '')
          return h('div', { key: relativePath, className: 'y-managerrow' }, [
            h('span', { key: 'path', className: 'y-managerpath', title: relativePath }, [
              directory ? h('span', { key: 'dir', className: 'y-managerdir' }, directory + '/') : null,
              h('span', { key: 'name', className: 'y-managername' }, name),
            ]),
            h('button', {
              key: 'restore',
              type: 'button',
              className: 'y-restore',
              title: t('restore'),
              'aria-label': t('restore') + '：' + relativePath,
              onClick: () => { restoreOne(relativePath) },
              'data-dsh-yinji-action': 'restore',
            }, IconCloseOutlineRegular ? h(IconCloseOutlineRegular) : h('span', null, '×')),
          ])
        })
        return h('div', { key: 'manager', className: 'y-popover', 'data-dsh-yinji-manager': '' }, [
          h('div', { key: 'head', className: 'y-pophead' }, [
            h('span', { key: 'title', className: 'y-poptitle' }, t('managerTitle')),
            h('button', {
              key: 'all',
              type: 'button',
              className: 'y-link',
              onClick: restoreAll,
              'data-dsh-yinji-action': 'restore-all',
            }, t('restoreAll')),
          ]),
          h('div', { key: 'list', className: 'y-poplist' },
            rows.length > 0 ? rows : h('div', { key: 'empty', className: 'y-note' }, t('managerEmpty'))),
          h('div', { key: 'hint', className: 'y-pophint' }, t('managerHint')),
        ])
      }

      const rootChildren = [
        renderHeader(),
        h('div', {
          key: 'body',
          className: 'y-body',
          ref: bodyRef,
          onScroll: onScroll,
          'data-dsh-yinji-body': '',
        }, h('ul', { key: 'level', className: 'y-level y-levelroot' }, renderLevel(state.root))),
      ]
      if (state.selectMode) rootChildren.push(renderSelectionBar())
      if (state.managerOpen) rootChildren.push(renderManager())

      return h('div', {
        className: 'y-root',
        ref: rootRef,
        'data-dsh-yinji': 'root',
        'data-dsh-yinji-state': 'tree',
        'data-dsh-yinji-root': state.root || '',
        'data-dsh-yinji-hidden': String(state.hidden.length),
      }, rootChildren)
    }
  }

  // ---------------------------------------------------------------------------
  // 左侧栏「工作区」选择性隐藏（vanilla DOM 控制器）
  //
  // 左侧栏的 WorkspaceBrowser 是一整块第三方实现的 React 组件，没有 workspace 级
  // 的行操作 slot，也没有对外的过滤钩子。这里用最小的 DOM 层接管：
  //   - 每个工作区行注入「隐藏此工作区」按钮（挂在行内 rowActions 里，跟随 hover 显隐）；
  //   - 隐藏时把该工作区的 group section（行 + 嵌套工作区 + 该组会话）display:none；
  //   - sectionHeader 里注入「已隐藏 N 个工作区」按钮，点开 fixed 定位的管理弹层恢复；
  //   - MutationObserver 负责在 React 重渲染 / 切换视图 / 展开折叠后重新对账；
  //   - 名单按 workspace id 存 localStorage（与文件树名单分开），纯界面、可恢复、不动数据。
  // ---------------------------------------------------------------------------

  const WS_EYE_OFF_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M1.6 8s2.25-4 6.4-4 6.4 4 6.4 4-2.25 4-6.4 4S1.6 8 1.6 8Z"></path><circle cx="8" cy="8" r="1.75"></circle><path d="M2.4 13.6 13.6 2.4"></path></svg>'
  const WS_CLOSE_SVG = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"><path d="M3.5 3.5 12.5 12.5"></path><path d="M12.5 3.5 3.5 12.5"></path></svg>'

  /**
   * 启动左侧栏工作区隐藏控制器。
   * @returns {Function} dispose：断开观察、移除注入节点、恢复被隐藏 section 的 display。
   */
  function startWorkspaceVeil() {
    const state = {
      store: readWorkspaceStore(),
      observer: null,
      observedTarget: null,
      intervalId: 0,
      rafId: 0,
      manager: null,
      headerButton: null,
      disposed: false,
      managerSignature: '',
    }

    function t(key, vars) {
      return format((messages()[key] || key), vars)
    }

    function schedule() {
      if (state.disposed || state.rafId) return
      if (typeof window.requestAnimationFrame !== 'function') {
        reconcile()
        return
      }
      state.rafId = window.requestAnimationFrame(() => {
        state.rafId = 0
        reconcile()
      })
    }

    function findSidebar() {
      return document.querySelector('[data-slot="sidebar"]') ||
        document.querySelector('[data-slot="sidebar.workspaces"]')
    }

    function findScope() {
      return document.querySelector('[data-slot="sidebar.workspaces"]')
    }

    function ensureObserved() {
      const target = findSidebar() || document.body
      if (state.observedTarget === target && state.observer) return
      if (state.observer) state.observer.disconnect()
      const observer = new MutationObserver(() => schedule())
      observer.observe(target, { childList: true, subtree: true })
      state.observer = observer
      state.observedTarget = target
    }

    /** 工作区行所在的 group section：行 + 嵌套工作区 + 该组会话都在里面。 */
    function groupSectionOf(row) {
      const tree = row.closest('[role="tree"]')
      let node = row
      if (!tree) return row.parentElement || row
      while (node.parentElement && node.parentElement !== tree) {
        if (node.parentElement.getAttribute('role') === 'group') return node
        node = node.parentElement
      }
      return node
    }

    /** 工作区行的 hover 操作区（最后一个包含按钮的 span）。 */
    function rowActionsOf(row) {
      const children = Array.from(row.children)
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index]
        if (child.tagName === 'SPAN' && child.querySelector('button') !== null) return child
      }
      const last = row.lastElementChild
      return last && last.tagName === 'SPAN' ? last : null
    }

    function workspaceLabelOf(row) {
      const text = (row.textContent || '').replace(/\s+/g, ' ').trim()
      return text
    }

    function findWorkspaceTree(scope) {
      const row = scope.querySelector('[data-row-key^="workspace:"]')
      if (row) {
        const tree = row.closest('[role="tree"]')
        if (tree) return tree
      }
      return scope.querySelector('[role="tree"]')
    }

    function findHeader(scope) {
      const tree = findWorkspaceTree(scope)
      if (!tree) return null
      // 从列表元素向上找：最近的、带按钮的前置兄弟节点就是 section header。
      let node = tree
      while (node && node !== scope) {
        const parent = node.parentElement
        if (!parent) break
        for (const sibling of Array.from(parent.children)) {
          if (sibling === node) break
          if (sibling.querySelector && sibling.querySelector('button') !== null && !sibling.contains(tree)) {
            return sibling
          }
        }
        node = parent
      }
      // 兜底：browser root 里列表之前的、带按钮的孩子。
      let root = tree
      while (root.parentElement && root.parentElement !== scope && scope.contains(root.parentElement)) {
        root = root.parentElement
      }
      for (const child of Array.from(root.children)) {
        if (child === tree || child.contains(tree)) continue
        if (child.querySelector && child.querySelector('button') !== null) return child
      }
      return null
    }

    function ensureHideButton(row, id, label) {
      const existing = row.querySelector('[data-dsh-yinji-ws-hide]')
      if (existing) {
        const title = t('hideWorkspace')
        existing.title = title
        existing.setAttribute('aria-label', t('hideWorkspaceAria', { name: label }))
        return
      }
      const actions = rowActionsOf(row)
      if (!actions) return
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'dsh-yinji-ws-tool'
      button.setAttribute('data-dsh-yinji-ws-hide', id)
      button.title = t('hideWorkspace')
      button.setAttribute('aria-label', t('hideWorkspaceAria', { name: label }))
      button.innerHTML = WS_EYE_OFF_SVG
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        hideWorkspace(id, label)
      })
      actions.insertBefore(button, actions.firstChild)
    }

    function hideWorkspace(id, label) {
      state.store = setWorkspaceHiddenInStore(state.store, id, label, true)
      writeWorkspaceStore(state.store)
      reconcile()
    }

    function restoreWorkspace(id) {
      state.store = setWorkspaceHiddenInStore(state.store, id, '', false)
      writeWorkspaceStore(state.store)
      reconcile()
    }

    function restoreAllWorkspaces() {
      state.store = clearWorkspacesInStore()
      writeWorkspaceStore(state.store)
      reconcile()
    }

    function headerLabel(count) {
      return t('workspaceHiddenCount', { n: count })
    }

    function syncHeaderButton(header, count) {
      let button = state.headerButton
      if (button && !button.isConnected) button = null
      if (button && button.parentElement !== header) {
        button.remove()
        button = null
      }
      if (count <= 0) {
        if (button) button.remove()
        state.headerButton = null
        if (state.manager) closeManager()
        return
      }
      if (button === null) {
        button = document.createElement('button')
        button.type = 'button'
        button.className = 'dsh-yinji-ws-tool dsh-yinji-ws-manager'
        button.setAttribute('data-dsh-yinji-ws-manager-button', '')
        button.innerHTML = WS_EYE_OFF_SVG + '<span class="dsh-yinji-ws-count"></span>'
        button.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          toggleManager(button)
        })
        state.headerButton = button
      }
      if (button.parentElement !== header) header.appendChild(button)
      button.style.display = ''
      const label = headerLabel(count)
      button.title = label
      button.setAttribute('aria-label', label)
      const countEl = button.querySelector('.dsh-yinji-ws-count')
      if (countEl) countEl.textContent = String(count)
    }

    function managerEntries() {
      return Object.keys(state.store.hidden)
        .map((id) => ({ id: id, title: state.store.hidden[id].title || id }))
        .sort((left, right) => left.title.localeCompare(right.title))
    }

    function buildManagerContent(el) {
      el.textContent = ''
      const head = document.createElement('div')
      head.className = 'dsh-yinji-ws-pophead'
      const title = document.createElement('span')
      title.className = 'dsh-yinji-ws-poptitle'
      title.textContent = t('workspaceManagerTitle')
      const all = document.createElement('button')
      all.type = 'button'
      all.className = 'dsh-yinji-ws-link'
      all.textContent = t('workspaceRestoreAll')
      all.setAttribute('data-dsh-yinji-ws-restore-all', '')
      all.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        restoreAllWorkspaces()
      })
      head.appendChild(title)
      head.appendChild(all)

      const list = document.createElement('div')
      list.className = 'dsh-yinji-ws-poplist'
      const entries = managerEntries()
      if (entries.length === 0) {
        const empty = document.createElement('div')
        empty.className = 'dsh-yinji-ws-empty'
        empty.textContent = t('workspaceManagerEmpty')
        list.appendChild(empty)
      }
      for (const entry of entries) {
        const rowEl = document.createElement('div')
        rowEl.className = 'dsh-yinji-ws-poprow'
        rowEl.setAttribute('data-dsh-yinji-ws-manager-row', entry.id)
        const text = document.createElement('span')
        text.className = 'dsh-yinji-ws-poptitletext'
        text.textContent = entry.title
        text.title = entry.title
        const restore = document.createElement('button')
        restore.type = 'button'
        restore.className = 'dsh-yinji-ws-restore'
        restore.title = t('workspaceRestore')
        restore.setAttribute('aria-label', t('workspaceRestoreAria', { name: entry.title }))
        restore.innerHTML = WS_CLOSE_SVG
        restore.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          restoreWorkspace(entry.id)
        })
        rowEl.appendChild(text)
        rowEl.appendChild(restore)
        list.appendChild(rowEl)
      }

      const hint = document.createElement('div')
      hint.className = 'dsh-yinji-ws-pophint'
      hint.textContent = t('workspaceManagerHint')
      el.appendChild(head)
      el.appendChild(list)
      el.appendChild(hint)
    }

    function positionManager(el, anchor) {
      if (!anchor || !anchor.isConnected) return
      const rect = anchor.getBoundingClientRect()
      const width = 248
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width))
      const top = Math.max(8, rect.bottom + 6)
      el.style.left = left + 'px'
      el.style.top = top + 'px'
    }

    function closeManager(silent) {
      const manager = state.manager
      if (!manager) return
      state.manager = null
      if (manager.anchor && manager.anchor.isConnected) manager.anchor.setAttribute('aria-expanded', 'false')
      document.removeEventListener('pointerdown', manager.onPointerDown, true)
      document.removeEventListener('keydown', manager.onKeyDown, true)
      window.removeEventListener('resize', manager.onReposition)
      window.removeEventListener('scroll', manager.onReposition, true)
      manager.el.remove()
      if (!silent) schedule()
    }

    function openManager(anchor) {
      closeManager(true)
      const el = document.createElement('div')
      el.className = 'dsh-yinji-ws-popover'
      el.setAttribute('data-dsh-yinji-ws-manager', '')
      buildManagerContent(el)
      document.body.appendChild(el)
      const onPointerDown = (event) => {
        if (el.contains(event.target)) return
        if (anchor && (event.target === anchor || anchor.contains(event.target))) return
        closeManager()
      }
      const onKeyDown = (event) => {
        if (event.key === 'Escape') closeManager()
      }
      const onReposition = () => positionManager(el, anchor)
      document.addEventListener('pointerdown', onPointerDown, true)
      document.addEventListener('keydown', onKeyDown, true)
      window.addEventListener('resize', onReposition)
      window.addEventListener('scroll', onReposition, true)
      if (anchor) anchor.setAttribute('aria-expanded', 'true')
      state.manager = {
        el: el,
        anchor: anchor,
        onPointerDown: onPointerDown,
        onKeyDown: onKeyDown,
        onReposition: onReposition,
      }
      positionManager(el, anchor)
    }

    function toggleManager(anchor) {
      if (state.manager) closeManager()
      else openManager(anchor)
    }

    function refreshManager() {
      if (!state.manager) return
      const entries = managerEntries()
      if (entries.length === 0) {
        closeManager()
        return
      }
      buildManagerContent(state.manager.el)
      positionManager(state.manager.el, state.manager.anchor)
    }

    function managerSignature() {
      return Object.keys(state.store.hidden)
        .map((id) => id + ':' + (state.store.hidden[id].title || ''))
        .sort()
        .join('|')
    }

    function reconcile() {
      if (state.disposed) return
      ensureObserved()
      const scope = findScope()
      if (!scope) {
        if (state.headerButton) {
          state.headerButton.remove()
          state.headerButton = null
        }
        if (state.manager) closeManager()
        return
      }

      const rows = Array.from(scope.querySelectorAll('[data-row-key^="workspace:"]'))
      let storeDirty = false
      for (const row of rows) {
        const key = row.getAttribute('data-row-key')
        if (!isWorkspaceRowKey(key)) continue
        const id = workspaceIdOfRowKey(key)
        const label = workspaceLabelOf(row)
        const hidden = Object.prototype.hasOwnProperty.call(state.store.hidden, id)
        const section = groupSectionOf(row)
        if (hidden) {
          if (section && section.getAttribute('data-dsh-yinji-ws-hidden') !== id) {
            if (!section.hasAttribute('data-dsh-yinji-ws-prev-display')) {
              section.setAttribute('data-dsh-yinji-ws-prev-display', section.style.display || '')
            }
            section.setAttribute('data-dsh-yinji-ws-hidden', id)
            section.style.display = 'none'
          }
          if (label !== '' && state.store.hidden[id].title !== label) {
            state.store.hidden[id].title = label
            storeDirty = true
          }
        } else if (section && section.hasAttribute('data-dsh-yinji-ws-hidden')) {
          section.style.display = section.getAttribute('data-dsh-yinji-ws-prev-display') || ''
          section.removeAttribute('data-dsh-yinji-ws-hidden')
          section.removeAttribute('data-dsh-yinji-ws-prev-display')
        }
        if (!hidden) ensureHideButton(row, id, label)
      }

      if (storeDirty) writeWorkspaceStore(state.store)

      const header = findHeader(scope)
      const hiddenCount = Object.keys(state.store.hidden).length
      if (header) syncHeaderButton(header, hiddenCount)
      else if (state.headerButton) {
        state.headerButton.remove()
        state.headerButton = null
      }

      if (state.manager) {
        const signature = managerSignature()
        if (signature !== state.managerSignature) {
          state.managerSignature = signature
          refreshManager()
        }
      }
    }

    function onStorage(event) {
      if (event.key !== WORKSPACE_STORAGE_KEY) return
      state.store = readWorkspaceStore()
      schedule()
    }

    try {
      window.addEventListener('storage', onStorage)
    } catch (error) {
      /* ignore */
    }
    state.intervalId = window.setInterval(() => {
      if (state.disposed) return
      ensureObserved()
      schedule()
    }, 1500)
    schedule()

    return function disposeWorkspaceVeil() {
      if (state.disposed) return
      state.disposed = true
      if (state.observer) {
        state.observer.disconnect()
        state.observer = null
      }
      if (state.intervalId) {
        window.clearInterval(state.intervalId)
        state.intervalId = 0
      }
      if (state.rafId && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(state.rafId)
        state.rafId = 0
      }
      try { window.removeEventListener('storage', onStorage) } catch (error) { /* ignore */ }
      closeManager(true)
      document.querySelectorAll('[data-dsh-yinji-ws-hide]').forEach((el) => { el.remove() })
      document.querySelectorAll('[data-dsh-yinji-ws-manager-button]').forEach((el) => { el.remove() })
      document.querySelectorAll('[data-dsh-yinji-ws-manager]').forEach((el) => { el.remove() })
      document.querySelectorAll('[data-dsh-yinji-ws-hidden]').forEach((el) => {
        el.style.display = el.getAttribute('data-dsh-yinji-ws-prev-display') || ''
        el.removeAttribute('data-dsh-yinji-ws-hidden')
        el.removeAttribute('data-dsh-yinji-ws-prev-display')
      })
    }
  }

  // ---------------------------------------------------------------------------
  // plugin module
  // ---------------------------------------------------------------------------

  /** 供 smoke test 使用的纯函数面（不触碰 DOM / React）。 */
  const internal = {
    normalizeSlashes: normalizeSlashes,
    stripTrailingSlashes: stripTrailingSlashes,
    isWindowsPath: isWindowsPath,
    comparisonKey: comparisonKey,
    childPath: childPath,
    rootKeyOf: rootKeyOf,
    relativePathOf: relativePathOf,
    normalizeHiddenPath: normalizeHiddenPath,
    isHiddenPath: isHiddenPath,
    hiddenDescendantCount: hiddenDescendantCount,
    normalizeSelection: normalizeSelection,
    mergeHidden: mergeHidden,
    removeHidden: removeHidden,
    sessionFileAddress: sessionFileAddress,
    orderEntries: orderEntries,
    basenameOf: basenameOf,
    format: format,
    CURRENT_LANGUAGE: currentLanguage,
    // 左侧栏工作区隐藏
    isWorkspaceRowKey: isWorkspaceRowKey,
    workspaceIdOfRowKey: workspaceIdOfRowKey,
    setWorkspaceHiddenInStore: setWorkspaceHiddenInStore,
    clearWorkspacesInStore: clearWorkspacesInStore,
    readWorkspaceStore: readWorkspaceStore,
    writeWorkspaceStore: writeWorkspaceStore,
    startWorkspaceVeil: startWorkspaceVeil,
  }

  const plugin = {
    name: PACKAGE,
    inject: ['slots', 'remote', 'remote.workspaceFiles', 'sidebarRightTabs'],
    apply(ctx) {
      ensureStyles()

      // 左侧栏「工作区」选择性隐藏：纯 DOM 控制器，不依赖 React，
      // 即使右侧文件树接管失败也要独立生效。
      try {
        const disposeWorkspaceVeil = startWorkspaceVeil()
        if (typeof ctx.effect === 'function') {
          ctx.effect(() => () => { disposeWorkspaceVeil() }, 'dsh-yinji: left workspace veil')
        }
      } catch (error) {
        console.error('[dsh-yinji] 左侧栏工作区隐藏初始化失败。', error)
      }

      let React = null
      let primitives = null
      try {
        if (typeof plugin.__require === 'function') {
          React = plugin.__require('react')
          try { primitives = plugin.__require('@deepseek-ai/dsh-client-ui-primitives') } catch (error) { primitives = null }
        }
      } catch (error) {
        console.error('[dsh-yinji] 无法加载 react，文件树接管未启用。', error)
      }
      if (!React) return

      const FilesBody = createFilesBody(ctx, React, primitives)

      /** 接管 `files` kind 的 type 定义；内置 type 被遮蔽，本插件卸载后自动恢复。 */
      const definition = {
        id: TYPE_ID,
        kind: KIND,
        priority: 'extension',
        title: () => messages().typeLabel,
        guide: [{
          id: GUIDE_ENTRY_ID,
          // 0.2.x 的 guide 卡片用 commandId 找快捷键提示（内置文件树的命令仍由原包注册）。
          commandId: 'workspace.files',
          order: 10,
          title: () => messages().guideTitle,
          description: () => messages().guideDescription,
          icon: guideIcon(primitives, React),
        }],
      }

      try {
        ctx.effect(() => ctx.sidebarRightTabs.register(definition), 'dsh-yinji: files tab type')
      } catch (error) {
        console.error('[dsh-yinji] 接管「文件」标签页失败（右侧栏 type 注册被拒）。', error)
        return
      }

      try {
        // 注意：不要声明 children。0.2.x 内置 files body 已经声明了
        // `sidebar.right.tab.files.actions`（即使被遮蔽，声明仍在），重复声明会让
        // slots.register 直接 throw。代价是 header 里「在文件管理器中打开」这类
        // 挂在 files.actions 子槽上的动作在本 tab 不再出现（已知取舍）。
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TYPE_ID,
        }, FilesBody)), 'dsh-yinji: files tab body')
      } catch (error) {
        console.error('[dsh-yinji] 注册文件树 body 失败。', error)
      }
    },
    __internal: internal,
  }

  // 暴露给 CDP / 预览注入使用（不安装插件也能在真实页面里试 UI）。
  try { globalThis.__DSH_YINJI_PLUGIN__ = plugin } catch (error) { /* frozen */ }

  if (typeof window !== 'undefined' && window.__ModuleLoader__ && typeof window.__ModuleLoader__.load === 'function') {
    window.__ModuleLoader__.load({
      id: PACKAGE,
      factory(require) {
        plugin.__require = require
        return plugin
      },
    })
  }
})()
