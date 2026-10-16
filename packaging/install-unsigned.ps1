#Requires -Version 5.1
<#
.SYNOPSIS
    本机安装未签名 MSIX 测试包（需管理员 + 开发者模式）。

.DESCRIPTION
    自动挑选 output 目录下最新的 *_localtest.msix 并安装。
    未签名包要求 AppxManifest 的 Publisher 带未签名 OID，
    该包由 build-msix.ps1 -LocalTest 产出。

.PARAMETER Msix
    指定要安装的 msix 文件；留空则自动选择最新的 *_localtest.msix。
#>
[CmdletBinding()]
param([string]$Msix)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$OutputDir = Join-Path $ScriptDir 'output'

if (-not $Msix) {
    $p = Get-ChildItem $OutputDir -Filter '*_localtest.msix' -File -ErrorAction SilentlyContinue |
         Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $p) {
        # 还没有本地测试包：自动调用打包脚本生成（exe 已存在时跳过编译，省时省磁盘）
        $buildScript = Join-Path $ScriptDir 'build-msix.ps1'
        if (-not (Test-Path $buildScript)) { throw "未找到 *_localtest.msix，且找不到打包脚本：$buildScript" }
        Write-Host "未找到本地测试包，正在生成（build-msix.ps1 -LocalTest）..." -ForegroundColor Yellow
        $exeBuilt = Join-Path $ScriptDir 'src-tauri\target\release\MiauNoteBlock.exe'
        $bargs = @{ LocalTest = $true }
        if (Test-Path $exeBuilt) { $bargs['SkipBuild'] = $true }
        & $buildScript @bargs
        $p = Get-ChildItem $OutputDir -Filter '*_localtest.msix' -File -ErrorAction SilentlyContinue |
             Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if (-not $p) { throw "生成本地测试包失败，请检查上方日志。" }
    }
    $Msix = $p.FullName
}
if (-not (Test-Path $Msix)) { throw "找不到文件：$Msix" }

# 开启开发者模式（允许安装未签名/旁加载包）
try {
    $key = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock'
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    New-ItemProperty -Path $key -Name 'AllowDevelopmentWithoutDevLicense' -Value 1 -PropertyType DWord -Force | Out-Null
    Write-Host "已开启开发者模式（允许旁加载）。" -ForegroundColor DarkGray
} catch {
    Write-Warning "开启开发者模式失败，可手动在「设置 > 系统 > 开发者选项」中开启：$_"
}

Write-Host "安装：$Msix" -ForegroundColor Cyan
try {
    Add-AppxPackage -Path $Msix -ForceApplicationShutdown
} catch {
    Write-Host ""
    Write-Host "安装失败：$($_.Exception.Message)" -ForegroundColor Red
    Write-Host "常见原因与处理：" -ForegroundColor Yellow
    Write-Host "  1. 用了商店包（未签名）-> 必须安装 *_localtest.msix；重新运行 build-msix.ps1 -LocalTest"
    Write-Host "  2. 未开启开发者模式 -> 设置 > 系统 > 开发者选项 > 开发人员模式"
    Write-Host "  3. 已装更高版本 -> 先卸载：Remove-AppxPackage -Package Euxstudio.MiauNoteBlock_gwer11b85jr02"
    Write-Host "  4. 缺少 WebView2 运行时 -> 安装 Microsoft Edge WebView2 Runtime"
    exit 1
}
Write-Host "安装完成，可在开始菜单搜索 MiauNoteBlock 启动。" -ForegroundColor Green