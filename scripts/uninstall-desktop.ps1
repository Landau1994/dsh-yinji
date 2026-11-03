# dsh-yinji 桌面版卸载脚本
#
# 从 DSH Desktop 使用的 profile（默认 desktop）里移除 dsh-yinji：
# 通过 dsh plugin remove 移除依赖，并清理 profile 清单里残留的 dsh-yinji bundle 行。
# 安全、可重复执行；不会删除浏览器 localStorage 里已经存下的隐藏名单
# （需要清空时在 DevTools 里删除 key `dsh-yinji.v1` / `dsh-yinji.workspaces.v1`）。
# 本脚本不会重启 DSH Desktop —— 卸载完请手动重启。
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\uninstall-desktop.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\uninstall-desktop.ps1 -Profile yinji-test
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\uninstall-desktop.ps1 -WhatIf   # 只演示

[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    # DSH 自带 CLI（dsh.cmd）。不传则自动查找：DSH_CLI 环境变量 → PATH → 常见安装路径。
    [string]$Dsh,

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

if (-not $Dsh) { $Dsh = Find-DshCli }
if ($Dsh -and -not (Test-Path -LiteralPath $Dsh -PathType Leaf)) {
    $resolved = Get-Command $Dsh -ErrorAction SilentlyContinue
    if ($resolved -and $resolved.Source) { $Dsh = $resolved.Source }
    else { $Dsh = $null }
}

Write-Step "目标 profile：$Profile"
if ($Dsh) { Write-Step "DSH CLI：$Dsh" }
else { Write-Note '没找到 DSH 自带 CLI，跳过 pnpm remove，直接清理 profile 清单。' }

if (-not $PSCmdlet.ShouldProcess("profile '$Profile'", '卸载 dsh-yinji')) {
    if ($Dsh) {
        Write-Host 'WhatIf：未执行卸载。将运行的命令是：'
        Write-Host "  `"$Dsh`" plugin --profile $Profile remove dsh-yinji"
    }
    Write-Host 'WhatIf：随后会清理 profile 清单里残留的 dsh-yinji 依赖与 bundle 行。'
    return
}

# --- 1. 移除依赖（可重复执行） ---------------------------------------------

if ($Dsh) {
    Write-Step '运行 dsh plugin remove'
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $removeExit = 1
    try {
        & $Dsh plugin --profile $Profile remove dsh-yinji
        $removeExit = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($removeExit -ne 0) {
        Write-Note "dsh plugin remove 退出码 $removeExit（可能本来就没安装，继续校验 profile 清单）。"
    }
}

# --- 2. 校验并清理 profile 清单 --------------------------------------------

$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
$profileManifestPath = Join-Path $dshHome "profiles\$Profile\package.json"
if (-not (Test-Path -LiteralPath $profileManifestPath -PathType Leaf)) {
    throw "找不到 profile 清单：$profileManifestPath"
}

$profileManifest = Get-Content -LiteralPath $profileManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$hasDependency = $null -ne $profileManifest.dependencies -and
    $null -ne $profileManifest.dependencies.PSObject.Properties['dsh-yinji']
$bundles = @()
if ($null -ne $profileManifest.dsh -and $null -ne $profileManifest.dsh.profile) {
    $bundles = @($profileManifest.dsh.profile.bundles)
}
$hasBundle = $bundles -contains 'dsh-yinji'

if ($hasDependency -or $hasBundle) {
    Write-Note 'profile 清单里仍有 dsh-yinji 残留，正在清理。'
    Copy-Item -LiteralPath $profileManifestPath -Destination "$profileManifestPath.bak" -Force
    if ($hasDependency) { $profileManifest.dependencies.PSObject.Properties.Remove('dsh-yinji') }
    if ($hasBundle) { $profileManifest.dsh.profile.bundles = @($bundles | Where-Object { $_ -ne 'dsh-yinji' }) }
    $profileManifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $profileManifestPath -Encoding UTF8
}

Write-Ok 'profile 清单已不含 dsh-yinji'
Write-Host ''
Write-Host '卸载完成。' -ForegroundColor Green
Write-Host '下一步：请手动重启 DSH Desktop。右侧栏会恢复成内置「文件」树（隐藏名单仍留在 localStorage，但不再生效）。' -ForegroundColor Green
