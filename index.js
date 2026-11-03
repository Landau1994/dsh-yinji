/**
 * dsh-yinji — 「隐几」Host half.
 *
 * 这个插件是纯客户端 UI 插件：隐藏名单与界面都在浏览器半（client.js）里，
 * 宿主半只负责让 bundle 行成功挂载，不做任何事。
 *
 * 刻意保持零依赖、零副作用：一个 `link:` 安装的插件如果 import 了只存在于
 * DSH 安装目录里的包，会以 ERR_MODULE_NOT_FOUND 让整个 profile 起不来。
 *
 * @module dsh-yinji
 */

/** Stable Cordis plugin name; must equal the package name and the bundle row id. */
export const name = 'dsh-yinji'

/**
 * No host-side behavior: the browser half owns the Files tab takeover.
 */
export function apply() {}
