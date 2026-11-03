# 隐几 · dsh-yinji

[![CI](https://github.com/Landau1994/dsh-yinji/actions/workflows/ci.yml/badge.svg)](https://github.com/Landau1994/dsh-yinji/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![DSH](https://img.shields.io/badge/DSH-0.2.x-1f6feb)

**给 DSH 的两层「选择性隐藏」**：把不想看的工作区、目录、文件收起来。只影响界面，不影响模型。

- **左侧栏**：隐藏选中的**工作区**（连同组内会话）；标题栏的眼睛计数按钮负责管理 / 恢复。
- **右侧栏**：接管「文件」标签页，隐藏选中的**目录 / 文件**；支持多选、父目录计数徽标、一键恢复。
- 两套名单分别按工作区存在浏览器 `localStorage`，刷新页面、重开 DSH 仍然有效。

> **只影响界面，不影响模型。** 隐藏名单只作用于左侧列表和右侧文件树这两处 UI；模型的
> `read` / `glob` / `grep` / `@` 引用、会话数据、工作区注册、文件预览、搜索与 shell 访问
> 都不受影响。它是视觉降噪 / 界面收纳，不是权限控制，也不是隐私隔离。

名字取自《庄子·齐物论》「隐几而坐」——把几案收一收，眼前就清了。

## 功能

### 左侧栏：隐藏工作区

- 鼠标移到左侧「工作区」列表的任意真实工作区行上，行尾出现「眼睛划斜线」按钮，点击后
  该工作区**连同它的会话行**从左侧列表消失（`groupSection` 整块隐藏；未分组桶不受影响）。
- 「工作区」标题栏出现眼睛 + 计数按钮（`已隐藏 N 个工作区`），点开是管理弹层：
  逐项恢复、或「全部恢复」；Esc / 点弹层外关闭。
- 隐藏名单按 workspace id 存在浏览器 `localStorage`，刷新页面、重开 DSH 仍然有效；按工作区
  独立，互不串。多窗口间通过 `storage` 事件同步。
- 切换「按工作区 / 按工作区树 / 单列表」、展开折叠、搜索开合后，隐藏状态都保持；
  单列表 / 搜索视图没有工作区行可隐藏，header 计数仍可打开管理。
- 隐藏当前会话所在的工作区只会收起左侧对应的行 / 会话，**主会话区不受影响**；
  想找回时从管理弹层恢复即可。

### 右侧栏：隐藏文件 / 目录

- **接管右侧栏「文件」标签页**：复用 DSH 官方的 tab-type extension 机制，在同一个
  `files` kind 上以 `priority: 'extension'` 遮蔽内置文件树；外观、打开文件、目录展开、
  自动刷新都保持原样，只是行尾多了隐藏操作。
- **单个隐藏**：鼠标移到任意目录 / 文件行，行尾出现眼睛按钮，点击即隐藏
  （隐藏目录 = 隐藏整棵子树）。
- **多选隐藏**：标题栏的勾选按钮进入选择模式，逐行勾选（选父目录会自动收起子项），
  底部条「隐藏所选」一次生效。
- **恢复**：标题栏的眼睛计数按钮打开「已隐藏的项目」面板，逐项恢复或「全部恢复」；
  被隐藏内容所在的父目录行尾有一个小计数，提醒里面还有隐藏项。
- **按工作区持久化**：隐藏名单按工作区根目录存 `localStorage`，切会话、切标签页、
  重开 DSH 都还在。
- **状态保持 / 自动刷新**：右侧栏切换标签、折叠、切会话再回来，展开状态与滚动位置仍在；
  展开目录沿用 `workspaceFiles.changes` 的目录 watch 自动刷新。

## 安装

**前置**：DSH Desktop 0.2.x。插件是纯浏览器插件，没有构建步骤与运行时依赖；
安装脚本用 Windows PowerShell（其它平台按下方「手动安装」）。

```powershell
git clone https://github.com/Landau1994/dsh-yinji.git
cd dsh-yinji
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-desktop.ps1

# 装完手动重启 DSH Desktop
```

安装脚本会：

1. 定位 DSH 自带 CLI（PATH、常见安装路径；找不到时用 `-Dsh <dsh.cmd 路径>` 指定）；
2. 执行 `dsh plugin --profile desktop add <本仓库目录>`，在 desktop profile 里登记本地链接；
3. 校验并在需要时补写 profile 的 `dsh.profile.bundles`。

脚本是幂等的，不会重启应用，也不会改动其它 profile。先看它要做什么可以加 `-WhatIf`；
想装到别的 profile 加 `-Profile <名字>`。

手动安装（任意平台）：

```bash
# 1) 登记本地链接
dsh plugin --profile desktop add /path/to/dsh-yinji

# 2) 在 profile 的 package.json → dsh.profile.bundles 里加上 "dsh-yinji"
#    （%USERPROFILE%\.dsh\profiles\desktop\package.json）

# 3) 重启 DSH Desktop
```

卸载：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\uninstall-desktop.ps1
# 或
dsh plugin --profile desktop remove dsh-yinji
# 同样需要重启
```

卸载后内置文件树自动恢复（插件只是遮蔽它，不删除其注册）；隐藏名单仍留在
浏览器 `localStorage` 里，但不再生效。

## 使用

### 左侧栏隐藏工作区

1. 鼠标移到左侧栏「工作区」里的一行，行尾出现眼睛按钮 → 点击隐藏。
2. 「工作区」标题栏最右侧出现眼睛 + 数字（如 `已隐藏 2 个工作区`）→ 点开管理。
3. 管理弹层里点某行 `×` 恢复单个，或「全部恢复」；Esc / 点外面关闭。
4. 想临时只看某些工作区时，隐藏完再逐个恢复即可；没删任何数据。

### 右侧栏隐藏文件

1. 打开右侧栏（会话右上角的展开按钮），在 guide 页点「工作区文件」。
2. 鼠标移到一行上，点行尾眼睛 → 该行消失。目录会连同整棵子树一起隐藏。
3. 标题栏出现眼睛 + 数字：点开管理已隐藏项；「全部恢复」一键清空本工作区的名单。
4. 标题栏勾选按钮 → 多选模式：勾选若干行后点底部「隐藏所选」。
5. 想恢复单个：管理面板里点对应行的 `×`；Esc 或点面板外关闭面板。

## 存储与隐私

两套名单分开存，都是纯浏览器 `localStorage`：

| 功能 | key | 结构 |
|---|---|---|
| 左侧栏工作区 | `dsh-yinji.workspaces.v1` | `{ version: 1, hidden: { "<workspaceId>": { title, hiddenAt } } }` |
| 右侧栏文件树 | `dsh-yinji.v1` | `{ version: 1, roots: { "<工作区规范化路径>": { hidden: ["<相对路径>", ...] } } }` |

- 不写宿主配置文件、不注册宿主路由、不产生会话事件、不向任何服务器发送数据。
- 插件卸载后名单留在浏览器里但不再生效；需要清空时在 DevTools → Application →
  Local Storage 删掉对应 key。
- 同一台机器上不同 origin（桌面版与 `dsh web` 测试服务器）的 localStorage 相互独立。

## 工作原理

### 左侧栏工作区（DOM 层最小接管）

左侧栏的 WorkspaceBrowser 是 DSH 自带的一整块第三方 React 组件：没有 workspace 级的行操作
slot，也没有对外的过滤钩子。因此本插件在 `[data-slot="sidebar.workspaces"]` 的 DOM 上做最小接管：

- 每个真实工作区行（`[data-row-key="workspace:<uuid>"]`）的 `rowActions` 里注入一个隐藏按钮，
  跟内置操作一样在行 hover 时出现；
- 隐藏时给该行的 **group section**（行 + 嵌套工作区 + 本组会话）设 `display:none`，并打
  `data-dsh-yinji-ws-hidden` 标记；
- 在 `sectionHeader` 末尾注入「已隐藏 N」按钮，管理弹层用 fixed 定位挂到 `body`，避免被
  `sectionHeader` 的 `overflow:hidden` 裁掉；
- `MutationObserver` 监听左侧栏子树，在 React 重渲染、切视图、展开折叠、搜索开合后重新对账；
  监听 `storage` 事件同步其他窗口；
- 隐藏名单只按 workspace id 存，不动 workspace registry / 会话数据；卸载插件时移除注入节点、
  恢复 `display`。

### 右侧栏文件树（官方 tab-type extension）

DSH 右侧栏的 tab type 注册表允许一个 `builtin` kind 与一个 `extension` 实现共存，extension 优先；
本插件注册 `{ id: 'dsh-yinji/files', kind: 'files', priority: 'extension' }`：

- 遮蔽内置 type、保留其注册，卸载插件后内置文件树自动恢复；
- body 注册进 `sidebar.right.pane.tab` 的 keyed 座位（key = 我们的 type id）；
- definition 自带同样的 `guide` 入口（`workspace`），所以 guide 页上的「工作区文件」入口不会消失；
- 文件打开仍走 `tab.actions.openResource(dsh-resource://file/session/...)`，由 DSH 自己的
  资源 / 预览体系承接；目录 listing 与 watch 走 `ctx.remote.workspaceFiles.list/changes`。

因此这是**纯浏览器插件**：宿主半 `index.js` 只负责让 bundle 行挂载成功，不做任何事。
没有构建步骤，`client.js` 就是 index.html 里直接加载的 lazy-CJS client module。

## 兼容性

- **目标运行时**：DSH 0.2.x（开发与验收基线 DSH Desktop `0.2.1-rc.3`）。左侧依赖 0.2.x
  左侧栏的 DOM 锚点（`data-row-key` / `groupSection` / `rowActions` / `sectionHeader`），
  右侧依赖 `sidebarRightTabs` 的 extension 语义与 keyed slot 分发；上游大版本改动这些契约
  时需要同步适配。
- **界面回归**：左侧 + 右侧在 DSH `0.2.1-rc.3` 上做过 CDP 自动化回归，106 项断言全部通过
  （覆盖接管、单隐 / 多选 / 恢复、刷新与跨会话持久化、深色主题、1280×800 窄视口、
  Console 无插件错误）。QA 驱动脚本依赖本机 DSH 环境，未随仓库发布。
- **单元测试**：`npm test` = 16 例纯函数冒烟（路径规范化、名单合并 / 恢复、资源地址编码、
  排序、左侧工作区名单、localStorage 兜底），零依赖，Node ≥ 20。

### 维护者注意（0.2.1 实测坑）

1. **右侧 body 注册不要在 `children` 里声明 `sidebar.right.tab.files.actions`**：0.2.x 的内置
   files body 已经声明了它；`ctx.slots.register` 遇到重复子槽声明会直接 throw。而 client plugin
   的激活顺序由 Cordis service 依赖决定，扩展很可能先于内置 files 激活——此时先注册的一方会抛错，
   严重时会让内置 `@deepseek-ai/dsh-client-ui-sidebar-files` 激活失败、整个 web boot 报
   `Failed to load plugins`。本插件因此不声明 children、也不渲染该子槽。
2. **左侧行的隐藏按钮要挂在 `rowActions` 里**（它默认 `display:none`、行 hover 才显示）；挂在
   row 其它位置会占位或挤掉标题。`groupSection` 的 `display:none` 才会连会话一起隐藏，
   单独隐藏 workspace 行会留下该组的会话行。

## 开发

```powershell
# 纯函数冒烟（路径规范化、隐藏名单合并 / 恢复、资源地址编码、排序、左侧工作区名单）
npm test        # 等价于 node test/smoke.mjs

# 语法检查
node --check client.js
node --check index.js
```

仓库结构：

```text
dsh-yinji/
├─ index.js               宿主半（空 apply，只负责 bundle 行挂载）
├─ client.js              浏览器半：左侧栏工作区 + 右侧文件树
├─ cordis.patch.yml       bundle 挂载声明
├─ package.json           dsh.bundle + dsh.client(immediately, platform=web)
├─ assets/icon.svg        文件夹 + 朱砂划线图标
├─ scripts/               install / uninstall-desktop.ps1（幂等，Windows PowerShell）
├─ test/smoke.mjs         零依赖纯函数冒烟测试
├─ .github/workflows/     CI：npm test + 语法检查（Node 20 / 22）
└─ CHANGELOG.md
```

## 已知限制

- **两侧都只影响界面**：模型的 `read` / `glob` / `grep` / `@` 引用、文件预览、搜索与 shell
  都不受影响；左侧隐藏也不删除工作区 / 会话。
- **左侧只隐藏「左侧列表」**：新会话 hero 的工作区选择器、工作区 hover 卡片、其它列出工作区的
  界面不受影响；需要全局不可见时请用 DSH 自己的工作区删除（会保留会话数据为未分组）。
- **左侧按 workspace id 记名单**：删除后重新添加同一目录会成为新 workspace，不会继承隐藏状态；
  若某个隐藏 id 对应的工作区已不在，管理弹层里仍会列出它的旧标题，点恢复即可清掉。
- **左侧是 DOM 层接管**：上游改版若改掉 `data-row-key` / `groupSection` / `rowActions` /
  `sectionHeader` 等锚点，需要适配（详见「排障」）。
- **左侧隐藏需要鼠标**：隐藏按钮继承内置 rowActions 的 hover 显示方式，纯键盘暂不能触发隐藏
  （管理 / 恢复弹层可用键盘）。
- **右侧 header 少一个控件**：0.2.x 的「在文件管理器中打开」（挂在
  `sidebar.right.tab.files.actions` 子槽）在接管后的文件 tab 不显示，原因见「维护者注意」。
- **右侧多标签不同步**：同一工作区若在两个右侧栏面板里同时打开「文件」标签页，在一处隐藏后，
  另一处要等刷新 / 重新打开才反映。

## 排障

- **左侧工作区没有隐藏按钮**：按钮挂在行内 `rowActions` 里，只在鼠标悬停工作区行时出现
  （这是内置行操作区，未 hover 时 `display:none`，因此纯键盘暂时无法触发隐藏；已隐藏项的
  管理弹层可以键盘操作）。若 hover 也没有，确认 DSH 版本仍是 0.2.x（DOM 锚点见上），
  并看 Console 是否有 `[dsh-yinji]` 错误。
- **单列表 / 搜索视图下看不到工作区行**：这两个视图本来就没有工作区行；切回「按工作区」或
  「按工作区树」即可看到隐藏效果，header 计数仍在。
- **重启后没接管右侧文件树**：确认 profile `package.json` 的 `dependencies` 与
  `dsh.profile.bundles` 都有 `dsh-yinji`；确认应用确实重启过（或 HMR 已热加载）；看 Console
  是否有注册失败日志。
- **隐藏后模型还是能读 / 会话还在**：这是设计如此，本插件只做界面隐藏。
- **升级 DSH 后失效**：见「兼容性」——DOM 锚点或 tab extension 契约变了就需要适配。

## 许可

[MIT License](./LICENSE)。设计、代码与图标均为原创（图标是内联 SVG，无第三方图片资源）。
