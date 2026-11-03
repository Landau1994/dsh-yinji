/**
 * dsh-yinji — 零依赖冒烟测试：在 Node VM 里 materialize client.js 的 lazy-CJS 工厂，
 * 只验证纯函数面（路径、隐藏名单、地址编码、排序）。DOM / React 部分由 CDP 实测覆盖。
 *
 * 运行：node test/smoke.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

/** 最小 window：只提供 __ModuleLoader__.load 捕获注册。 */
const registrations = []
const sandbox = {
  console,
  Intl,
  encodeURIComponent,
  decodeURIComponent,
  window: {
    __ModuleLoader__: {
      load(registration) {
        registrations.push(registration)
      },
    },
  },
}
sandbox.globalThis = sandbox
sandbox.window.localStorage = {
  store: new Map(),
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null },
  setItem(key, value) { this.store.set(key, String(value)) },
  removeItem(key) { this.store.delete(key) },
}

vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

assert.equal(registrations.length, 1, 'client.js 应向 __ModuleLoader__ 注册恰好一个工厂')
const registration = registrations[0]
assert.equal(registration.id, 'dsh-yinji', '工厂 id 应为包名')

const plugin = registration.factory((specifier) => {
  throw new Error('smoke test 不应 require 任何模块：' + specifier)
})
assert.equal(plugin.name, 'dsh-yinji')
assert.deepEqual([...plugin.inject], ['slots', 'remote', 'remote.workspaceFiles', 'sidebarRightTabs'])
const I = plugin.__internal

/** VM 里 new 出来的数组原型属于另一个 realm，用 JSON 比较避免 deepStrictEqual 的原型检查。 */
function eq(actual, expected) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected))
}

let passed = 0
function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log('  ok  ' + name)
  } catch (error) {
    console.error('FAIL  ' + name)
    throw error
  }
}

test('childPath：混合分隔符归一，去掉尾部斜杠', () => {
  assert.equal(I.childPath('E:\\work\\', 'a'), 'E:/work/a')
  assert.equal(I.childPath('/home/me/', 'notes.md'), '/home/me/notes.md')
})

test('childPath / relativePathOf：文件系统根（C:/ 与 /）不产生双斜杠', () => {
  assert.equal(I.childPath('C:\\', 'Users'), 'C:/Users')
  assert.equal(I.childPath('/', 'home'), '/home')
  assert.equal(I.relativePathOf('C:\\', 'C:/Users/me'), 'Users/me')
  assert.equal(I.relativePathOf('/', '/home/me'), 'home/me')
  assert.equal(I.relativePathOf('C:\\', 'C:\\'), '')
})

test('relativePathOf：Windows 大小写不敏感，POSIX 保留大小写', () => {
  assert.equal(I.relativePathOf('E:\\Work', 'E:/work/a/b'), 'a/b')
  assert.equal(I.relativePathOf('/home/me', '/home/me/x.md'), 'x.md')
  assert.equal(I.relativePathOf('/home/me', '/home/me'), '')
  assert.equal(I.relativePathOf('/home/me', '/other/x'), '/other/x')
})

test('normalizeHiddenPath：去掉首尾 / 与空段', () => {
  assert.equal(I.normalizeHiddenPath('/a//b/'), 'a/b')
  assert.equal(I.normalizeHiddenPath('.reference/qa/'), '.reference/qa')
  assert.equal(I.normalizeHiddenPath('   '), '')
})

test('isHiddenPath：自身与后代都算隐藏，祖先不算', () => {
  const hidden = ['.reference', 'tools/cache']
  assert.equal(I.isHiddenPath(hidden, '.reference'), true)
  assert.equal(I.isHiddenPath(hidden, '.reference/qa/shot.png'), true)
  assert.equal(I.isHiddenPath(hidden, 'tools/cache/latest.json'), true)
  assert.equal(I.isHiddenPath(hidden, 'tools'), false)
  assert.equal(I.isHiddenPath(hidden, 'tools/cache2/x'), false)
  assert.equal(I.isHiddenPath(hidden, ''), false)
})

test('hiddenDescendantCount：只数严格后代，且 Windows 大小写不敏感', () => {
  const hidden = ['A/b', 'A/c', 'd']
  assert.equal(I.hiddenDescendantCount(hidden, 'a', true), 2)
  assert.equal(I.hiddenDescendantCount(hidden, ''), 0)
  assert.equal(I.hiddenDescendantCount(hidden, 'd', true), 0)
})

test('mergeHidden：父目录覆盖子项，去重排序', () => {
  eq(I.mergeHidden(['a/b', 'z'], ['a']), ['a', 'z'])
  eq(I.mergeHidden(['a'], ['a/b']), ['a'])
  eq(I.mergeHidden([], ['x/y', 'x/z']), ['x/y', 'x/z'])
})

test('normalizeSelection：祖先存在时子项被折叠', () => {
  eq(I.normalizeSelection(['a/b', 'a', 'c/d']), ['a', 'c/d'])
  eq(I.normalizeSelection([]), [])
})

test('removeHidden：只恢复指定项', () => {
  eq(I.removeHidden(['a', 'b/c'], 'a'), ['b/c'])
  eq(I.removeHidden(['A'], 'a', true), [])
})

test('rootKeyOf：工作区 key 稳定（Windows 小写）', () => {
  assert.equal(I.rootKeyOf('E:\\Project\\X\\'), 'e:/project/x')
  assert.equal(I.rootKeyOf('/home/me'), '/home/me')
})

test('sessionFileAddress：与 dsh-util-workspace-path 编码规则一致', () => {
  assert.equal(
    I.sessionFileAddress('session-abc', 'a b/c#d.txt'),
    'dsh-resource://file/session/session-abc/a%20b/c%23d.txt',
  )
  assert.equal(
    I.sessionFileAddress('session-abc', 'C:/x/y.txt'),
    'dsh-resource://file/session/session-abc/C:/x/y.txt',
  )
})

test('orderEntries：目录在前，名称自然排序', () => {
  const entries = [
    { name: 'file10', type: 'file' },
    { name: 'file2', type: 'file' },
    { name: 'dir', type: 'directory' },
  ]
  eq(I.orderEntries(entries).map((entry) => entry.name), ['dir', 'file2', 'file10'])
})

test('basenameOf / format', () => {
  assert.equal(I.basenameOf('a/b/c.md'), 'c.md')
  assert.equal(I.basenameOf('top'), 'top')
  assert.equal(I.format('已隐藏 {n} 项 / {missing}', { n: 3 }), '已隐藏 3 项 / {missing}')
})

test('isWorkspaceRowKey / workspaceIdOfRowKey：只认真实 workspace uuid 行', () => {
  const id = '996822d5-c01f-472e-8f9c-a276d862625f'
  assert.equal(I.isWorkspaceRowKey('workspace:' + id), true)
  assert.equal(I.isWorkspaceRowKey('workspace:'), false)
  assert.equal(I.isWorkspaceRowKey('workspace:未分组'), false)
  assert.equal(I.isWorkspaceRowKey('session:' + id), false)
  assert.equal(I.isWorkspaceRowKey(undefined), false)
  assert.equal(I.workspaceIdOfRowKey('workspace:' + id), id)
})

test('setWorkspaceHiddenInStore：加入 / 删除工作区名单（纯函数）', () => {
  const id = '996822d5-c01f-472e-8f9c-a276d862625f'
  const empty = { version: 1, hidden: {} }
  const added = I.setWorkspaceHiddenInStore(empty, id, 'my_dsh_plugin', true)
  assert.equal(added.hidden[id].title, 'my_dsh_plugin')
  assert.equal(typeof added.hidden[id].hiddenAt, 'number')
  assert.equal(Object.keys(empty.hidden).length, 0, '不修改原 store')
  const removed = I.setWorkspaceHiddenInStore(added, id, '', false)
  assert.equal(Object.prototype.hasOwnProperty.call(removed.hidden, id), false)
  eq(Object.keys(I.clearWorkspacesInStore().hidden), [])
})

test('readWorkspaceStore / writeWorkspaceStore：localStorage 往返与坏数据兜底', () => {
  I.writeWorkspaceStore({ version: 1, hidden: { a: { title: 'A', hiddenAt: 1 } } })
  const read = I.readWorkspaceStore()
  assert.equal(read.hidden.a.title, 'A')
  assert.equal(read.hidden.a.hiddenAt, 1)
  I.writeWorkspaceStore({ version: 1, hidden: {} })
  eq(Object.keys(I.readWorkspaceStore().hidden), [])
  sandbox.window.localStorage.setItem('dsh-yinji.workspaces.v1', '{bad json')
  eq(Object.keys(I.readWorkspaceStore().hidden), [])
  sandbox.window.localStorage.removeItem('dsh-yinji.workspaces.v1')
})

console.log(`\ndsh-yinji smoke: ${passed} passed`)
