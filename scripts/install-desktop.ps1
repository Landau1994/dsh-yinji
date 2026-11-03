# dsh-yinji 桌面版安装脚本
#
# 把本仓库（dsh-yinji）安装到 DSH Desktop 使用的 profile（默认 desktop）：
# 先在 profile 里登记本地链接，再确保 profile 清单的 dsh.profile.bundles 含 dsh-yinji。
# 安全、可重复执行：重复运行只是把同一个本地链接再确认一次。
# 本脚本不会重启 DSH Desktop —— 装完请手动重启。
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-desktop.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-desktop.ps1 -WhatIf    # 只演示
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-desktop.ps1 -Profile yinji-test
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-desktop.ps1 -Dsh "D:\...\dsh.cmd"
#
# 卸载用同目录的 uninstall-desktop.ps1。

[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    # DSH 自带 CLI（dsh.cmd）。不传则自动查找：DSH_CLI 环境变量 → PATH → 常见安装路径。
    [string]$Dsh,

    # 插件目录（package.json 所在目录）。默认本脚本所在目录的上一级。
    [string]$PluginDir,

    # 桌面版使用的 profile 名。
    [string]$Profile = 'desktop'
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Text) { Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host "[OK] $Text" -ForegroundColor Green }
function Write-Note([string]$Text) { Write-Host "[!] $Text" -ForegroundColor Yellow }

function Find-DshCli {
    if ($env:DSH_CLI -and (Test-Path -LiteralPath $env:DSH_CLI -PathType Leaf)) {
        return (Resolve-Path -LiteralPath $env:DSH_CLI).Path
    }

    $command = Get-Command dsh -ErrorAction SilentlyContinue
    if ($command -and $command.Source -and (Test-Path -LiteralPath $command.Source -PathType Leaf)) {
        return $command.Source
    }

    $relative = 'resources\runtime\cli\bin\dsh.cmd'
    $roots = @()
    if ($env:LOCALAPPDATA) { $roots += (Join-Path $env:LOCALAPPDATA 'Programs\dsh') }
    if ($env:ProgramFiles) { $roots += (Join-Path $env:ProgramFiles 'dsh') }
    if (${env:ProgramFiles(x86)}) { $roots += (Join-Path ${env:ProgramFiles(x86)} 'dsh') }

    foreach ($root in $roots) {
        $candidate = Join-Path $root $relative
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    return $null
}

# --- 0. 前置检查 -----------------------------------------------------------

if (-not $PluginDir) { $PluginDir = Split-Path -Parent $PSScriptRoot }
if (-not (Test-Path -LiteralPath $PluginDir -PathType Container)) {
    throw "找不到插件目录：$PluginDir。请用 -PluginDir 指定 dsh-yinji 所在目录。"
}
$PluginDir = (Resolve-Path -LiteralPath $PluginDir).Path

if (-not $Dsh) { $Dsh = Find-DshCli }
if (-not $Dsh) {
    $message = @'
找不到 DSH 自带 CLI（dsh.cmd）。可以这样找到它：
  右击 DSH Desktop 快捷方式 → 打开文件所在位置 → 进入 resources\runtime\cli\bin；
然后重新运行本脚本并用 -Dsh 指定该 dsh.cmd 的完整路径，
或把该目录加入 PATH，或设置 DSH_CLI 环境变量。
'@
    throw $message
}
if (-not (Test-Path -LiteralPath $Dsh -PathType Leaf)) {
    $resolved = Get-Command $Dsh -ErrorAction SilentlyContinue
    if ($resolved -and $resolved.Source) { $Dsh = $resolved.Source }
    else { throw "找不到 DSH CLI：$Dsh。请用 -Dsh 指定 dsh.cmd 的完整路径。" }
}

$manifestPath = Join-Path $PluginDir 'package.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "找不到插件清单：$manifestPath。请确认 -PluginDir 指向 dsh-yinji 目录。"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.name -ne 'dsh-yinji') {
    throw "插件清单不是 dsh-yinji（实际为 $($manifest.name)）：$manifestPath"
}
if (-not (Test-Path -LiteralPath (Join-Path $PluginDir 'client.js') -PathType Leaf)) {
    throw "插件缺少 client.js，界面部分无法工作：$PluginDir"
}

Write-Step "插件：$PluginDir（dsh-yinji $($manifest.version)）"
Write-Step "DSH CLI：$Dsh"
Write-Step "目标 profile：$Profile"

if (-not $PSCmdlet.ShouldProcess("profile '$Profile'", "安装 dsh-yinji（$PluginDir）")) {
    Write-Host 'WhatIf：未执行安装。将运行的命令是：'
    Write-Host "  `"$Dsh`" plugin --profile $Profile add `"$PluginDir`""
    return
}

# --- 1. 安装（可重复执行） -------------------------------------------------

Write-Step '运行 dsh plugin add（pnpm 会在 profile 目录里登记本地链接）'
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$installExit = 1
try {
    & $Dsh plugin --profile $Profile add $PluginDir
    $installExit = $LASTEXITCODE
}
finally {
    $ErrorActionPreference = $previousPreference
}
if ($installExit -ne 0) {
    throw "安装失败：dsh plugin add 退出码 $installExit。请把上面的输出交给维护者。"
}
Write-Ok '已执行 dsh plugin add'

# --- 2. 校验插件已进入 profile 配置树 --------------------------------------

Write-Step '校验 profile 清单中包含 dsh-yinji（依赖 + bundle 行）'
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
$profileManifestPath = Join-Path $dshHome "profiles\$Profile\package.json"
if (-not (Test-Path -LiteralPath $profileManifestPath -PathType Leaf)) {
    throw "找不到 profile 清单：$profileManifestPath"
}

$profileManifest = Get-Content -LiteralPath $profileManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$hasDependency = $null -ne $profileManifest.dependencies -and
    $null -ne $profileManifest.dependencies.PSObject.Properties['dsh-yinji']
if (-not $hasDependency) {
    throw "安装后 profile 中仍找不到 dsh-yinji 依赖：$profileManifestPath"
}

$hasBundle = $null -ne $profileManifest.dsh -and
    $null -ne $profileManifest.dsh.profile -and
    (@($profileManifest.dsh.profile.bundles) -contains 'dsh-yinji')
if (-not $hasBundle) {
    Write-Note "bundle 行尚未写入，补上后重启即生效：$profileManifestPath"
    Copy-Item -LiteralPath $profileManifestPath -Destination "$profileManifestPath.bak" -Force
    if ($null -eq $profileManifest.dsh) { $profileManifest | Add-Member -NotePropertyName dsh -NotePropertyValue ([pscustomobject]@{}) -Force }
    if ($null -eq $profileManifest.dsh.profile) { $profileManifest.dsh | Add-Member -NotePropertyName profile -NotePropertyValue ([pscustomobject]@{ bundles = @() }) -Force }
    if ($null -eq $profileManifest.dsh.profile.bundles) { $profileManifest.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue @() -Force }
    $bundles = @($profileManifest.dsh.profile.bundles)
    if ($bundles -notcontains 'dsh-yinji') { $bundles += 'dsh-yinji' }
    $profileManifest.dsh.profile.bundles = $bundles
    $profileManifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $profileManifestPath -Encoding UTF8
    Write-Ok '已补写 bundle 行'
}
else {
    Write-Ok 'profile 已包含 dsh-yinji（依赖 + bundle 行）'
}

# --- 3. 下一步 -------------------------------------------------------------

Write-Host ''
Write-Host '安装完成。' -ForegroundColor Green
Write-Host '下一步：请手动重启 DSH Desktop（本脚本不会重启应用）。' -ForegroundColor Green
Write-Host '重启后打开右侧栏「文件」标签页，鼠标移到任意行尾点眼睛图标即可隐藏该项；' -ForegroundColor Green
Write-Host '标题栏的勾选按钮进入多选模式，眼睛计数按钮打开已隐藏项目管理。' -ForegroundColor Green
Write-Host '左侧栏「工作区」标题栏的眼睛计数按钮管理已隐藏的工作区。' -ForegroundColor Green
