#Requires -Version 5.1
<#
.SYNOPSIS
    将 MiauNoteBlock 打包为 Microsoft Store 标准 MSIX 应用包。

.DESCRIPTION
    面向磁盘资源紧张的环境设计：
      * Tauri 产物是单文件绿色 exe（前端资源全部内嵌），MSIX 包内只需
        「exe + 图标 + AppxManifest.xml」，staging 目录极小。
      * 使用 tauri build --no-bundle 复用增量编译，不触发 WiX/NSIS 下载与中间产物。
      * 打包完成后自动删除 staging；-PurgeTarget 可进一步清空 Rust 编译缓存。
      * 使用 Windows SDK 的 makeappx 打包，产出「未签名商店包」（.msix），
        可直接上传 Microsoft Store（商店负责签名）。
      * -LocalTest 额外产出 Publisher 带未签名 OID 的本地测试包，
        配合同目录 install-unsigned.cmd 可在本机安装验证。

.PARAMETER Version
    四段式版本号（如 1.0.0.0）。留空时自动递增：取 tauri.conf.json 版本、
    已有产物与本机已安装版本中的最大者，末段 +1。

.PARAMETER SkipBuild
    跳过 Tauri 编译，直接复用已存在的 exe。

.PARAMETER LocalTest
    额外生成本地安装测试包（Publisher 附加未签名 OID）。

.PARAMETER KeepStaging
    保留 staging 目录，便于排查问题。

.PARAMETER PurgeTarget
    打包完成后删除 src-tauri\target（可释放大量磁盘，代价是下次需全量重编）。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\build-msix.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\build-msix.ps1 -LocalTest
#>
[CmdletBinding()]
param(
    [string] $Version = '',
    [switch] $SkipBuild,
    [switch] $LocalTest,
    [switch] $KeepStaging,
    [switch] $PurgeTarget
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

# ============================ 商店身份信息（固定不变） ============================
$IdentityName         = 'Euxstudio.MiauNoteBlock'
$PackageFamilyName    = 'Euxstudio.MiauNoteBlock_gwer11b85jr02'
$Publisher            = 'CN=61A042EF-46FF-46B2-AF26-BB187D95DF79'
# 未签名包专用 OID：Windows 只允许 Publisher 带此标记的未签名包被注册（否则报 0x80073D2C）。
# 仅用于本地测试包，上传商店的包不能带它。
$UnsignedOid          = 'OID.2.25.311729368913984317654407730594956997722=1'
$PublisherDisplayName = 'COM1919'
$DisplayName          = 'MiauNoteBlock'
$Description          = 'Minecraft Note Block Studio'
$MinWinVersion        = '10.0.17763.0'
$MaxWinVersionTested  = '10.0.26100.0'
$Platform             = 'x64'
$ExeName              = 'MiauNoteBlock.exe'
$ApplicationId        = 'MiauNoteBlock'

# ============================ 路径 ============================
$ScriptDir   = $PSScriptRoot
$ProjectRoot = Split-Path $ScriptDir -Parent
$SrcTauri    = Join-Path $ScriptDir  'src-tauri'
$IconsDir    = Join-Path $SrcTauri   'icons'
$OutputDir   = Join-Path $ScriptDir  'output'
$StagingDir  = Join-Path $OutputDir  '_staging'
$AssetsDir   = Join-Path $StagingDir 'Assets'
$Tauri       = Join-Path $ProjectRoot 'node_modules\.bin\tauri.cmd'
$ExeBuilt    = Join-Path $SrcTauri    'target\release\MiauNoteBlock.exe'

# ============================ 工具函数 ============================
function Write-Step([int]$Index, [int]$Total, [string]$Text) {
    Write-Host ""
    Write-Host "[$Index/$Total] $Text" -ForegroundColor Cyan
}

function Get-SdkTool {
    param([Parameter(Mandatory)][string]$Name)
    $roots = New-Object System.Collections.Generic.List[string]
    $kitsRoot = $null
    try {
        $kitsRoot = (Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows Kits\Installed Roots' -ErrorAction SilentlyContinue).KitsRoot10
    } catch { }
    if ($kitsRoot) { $roots.Add((Join-Path $kitsRoot 'bin')) }
    $roots.Add("${env:ProgramFiles(x86)}\Windows Kits\10\bin")
    $roots.Add("$env:ProgramFiles\Windows Kits\10\bin")

    foreach ($r in $roots) {
        if (-not (Test-Path $r)) { continue }
        $cand = Get-ChildItem $r -Directory -ErrorAction SilentlyContinue |
                Sort-Object Name -Descending |
                ForEach-Object { Join-Path $_.FullName "x64\$Name" } |
                Where-Object { Test-Path $_ } |
                Select-Object -First 1
        if ($cand) { return $cand }
    }
    throw "未找到 Windows SDK 工具 $Name。请安装 Windows 10/11 SDK（含 makeappx）。"
}

function To-Quad([string]$v) {
    $p = @($v.Split('.') | Where-Object { $_ -ne '' })
    while ($p.Count -lt 4) { $p += '0' }
    return [version]($p[0..3] -join '.')
}

# ============================ 开始 ============================
$totalSteps = if ($LocalTest) { 5 } else { 4 }
Write-Host "==============================================" -ForegroundColor Green
Write-Host " MiauNoteBlock MSIX 打包脚本" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green

# ---------- 1. 编译 Tauri 绿色 exe（可跳过） ----------
Write-Step 1 $totalSteps "准备主程序 exe"
if ($SkipBuild) {
    Write-Host "  已跳过编译（-SkipBuild）" -ForegroundColor DarkGray
} else {
    if (-not (Test-Path $Tauri)) { throw "未找到 Tauri CLI：$Tauri`n请先在项目根目录执行 npm install。" }
    if (-not (Test-Path (Join-Path $ProjectRoot 'blbl-toy'))) {
        throw "未找到前端产物 blbl-toy。请先执行项目根目录的 build_local.bat。"
    }
    $env:CARGO_TERM_COLOR = 'never'
    $env:CARGO_BUILD_JOBS  = '1'   # 单线程：规避安全软件对新建 exe 的并发拦截 (os error 5)
    Push-Location $ScriptDir
    try { & $Tauri @('build', '--no-bundle') } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw "tauri build 失败，退出码 $LASTEXITCODE。" }
}
if (-not (Test-Path $ExeBuilt)) { throw "未找到主程序：$ExeBuilt" }
Write-Host "  $ExeBuilt  ($([math]::Round((Get-Item $ExeBuilt).Length / 1MB, 2)) MB)"

# ---------- 版本号 ----------
if (-not $Version) {
    $candidates = New-Object System.Collections.Generic.List[version]
    try {
        $conf = Get-Content (Join-Path $SrcTauri 'tauri.conf.json') -Raw | ConvertFrom-Json
        if ($conf.version) { $candidates.Add((To-Quad $conf.version)) }
    } catch { }
    Get-ChildItem $OutputDir -Filter '*.msix' -File -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.BaseName -match '_(\d+)\.(\d+)\.(\d+)\.(\d+)_') {
            $candidates.Add([version]"$($matches[1]).$($matches[2]).$($matches[3]).$($matches[4])")
        }
    }
    try {
        Get-AppxPackage -Name $IdentityName -ErrorAction SilentlyContinue | ForEach-Object {
            $candidates.Add([version]$_.Version)
        }
    } catch { }
    if ($candidates.Count -eq 0) { $candidates.Add([version]'1.0.0.0') }
    $latest  = $candidates | Sort-Object -Descending | Select-Object -First 1
    $Version = "$($latest.Major).$($latest.Minor).$($latest.Build).$($latest.Revision + 1)"
}
if ($Version -notmatch '^\d+\.\d+\.\d+\.\d+$') {
    throw "Version 必须为四段式数字，例如 1.0.0.0，当前值：$Version"
}

$OutputMsix = Join-Path $OutputDir "MiauNoteBlock_${Version}_${Platform}.msix"

# ---------- 2. 组装 staging（只放必要文件） ----------
Write-Step 2 $totalSteps "组装 staging（exe + 图标 + manifest）"
if (Test-Path $StagingDir) { Remove-Item $StagingDir -Recurse -Force }
New-Item -ItemType Directory -Path $AssetsDir -Force | Out-Null
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

Copy-Item $ExeBuilt (Join-Path $StagingDir $ExeName) -Force
Write-Host "  + $ExeName"

$needIcons = @('StoreLogo', 'Square44x44Logo', 'Square71x71Logo', 'Square150x150Logo', 'Square310x310Logo')
foreach ($n in $needIcons) {
    $src = Join-Path $IconsDir "$n.png"
    if (-not (Test-Path $src)) { throw "缺少图标：$src（请先执行 tauri icon 生成图标）" }
    Copy-Item $src (Join-Path $AssetsDir "$n.png") -Force
}
Write-Host "  + Assets ($($needIcons.Count) 个标准尺寸图标)" -ForegroundColor Green

# ---------- 3. 生成 AppxManifest.xml ----------
Write-Step 3 $totalSteps "生成 AppxManifest.xml"

$manifestTemplate = @'
<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">
  <Identity Name="{NAME}" Publisher="{PUBLISHER}" Version="{VERSION}" ProcessorArchitecture="{ARCH}" />
  <Properties>
    <DisplayName>{DISPLAYNAME}</DisplayName>
    <PublisherDisplayName>{PUBLISHERDISPLAYNAME}</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
    <Description>{DESCRIPTION}</Description>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="{MINVER}" MaxVersionTested="{MAXVER}" />
  </Dependencies>
  <Resources>
    <Resource Language="zh-CN" />
    <Resource Language="en-US" />
  </Resources>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
  <Applications>
    <Application Id="{APPID}" Executable="{EXE}" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="{DISPLAYNAME}"
        Description="{DESCRIPTION}"
        BackgroundColor="transparent"
        Square150x150Logo="Assets\Square150x150Logo.png"
        Square44x44Logo="Assets\Square44x44Logo.png">
        <uap:DefaultTile Square71x71Logo="Assets\Square71x71Logo.png" />
      </uap:VisualElements>
    </Application>
  </Applications>
</Package>
'@

$manifest = $manifestTemplate `
    -replace '\{NAME\}',                 $IdentityName `
    -replace '\{PUBLISHER\}',            $Publisher `
    -replace '\{PUBLISHERDISPLAYNAME\}', $PublisherDisplayName `
    -replace '\{DISPLAYNAME\}',          $DisplayName `
    -replace '\{DESCRIPTION\}',          $Description `
    -replace '\{VERSION\}',              $Version `
    -replace '\{ARCH\}',                 $Platform `
    -replace '\{MINVER\}',               $MinWinVersion `
    -replace '\{MAXVER\}',               $MaxWinVersionTested `
    -replace '\{APPID\}',                $ApplicationId `
    -replace '\{EXE\}',                  $ExeName

[System.IO.File]::WriteAllText((Join-Path $StagingDir 'AppxManifest.xml'), $manifest, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "  Identity : $IdentityName  $Version  $Platform"
Write-Host "  Publisher: $Publisher"
Write-Host "  PFN      : $PackageFamilyName"

# ---------- 4. 打包商店包（未签名） ----------
Write-Step 4 $totalSteps "使用 makeappx 打包（未签名商店包）"
$makeappx = Get-SdkTool 'makeappx.exe'
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
if (Test-Path $OutputMsix) { Remove-Item $OutputMsix -Force }
& $makeappx pack /d $StagingDir /p $OutputMsix /o
if ($LASTEXITCODE -ne 0) { throw "makeappx 打包失败，退出码 $LASTEXITCODE。" }
Write-Host "  商店包已生成：$OutputMsix" -ForegroundColor Green

# ---------- 5. 可选：本地测试包 ----------
$TestMsix = $null
if ($LocalTest) {
    Write-Step 5 $totalSteps "生成本地测试包（Publisher 附加未签名 OID）"
    $TestMsix = Join-Path $OutputDir "MiauNoteBlock_${Version}_${Platform}_localtest.msix"
    $oldAttr = 'Publisher="' + $Publisher + '"'
    $newAttr = 'Publisher="' + $Publisher + ', ' + $UnsignedOid + '"'
    $testManifest = $manifest.Replace($oldAttr, $newAttr)
    if ($testManifest -eq $manifest) { throw "未能为本地测试包写入未签名 OID。" }
    [System.IO.File]::WriteAllText((Join-Path $StagingDir 'AppxManifest.xml'), $testManifest, (New-Object System.Text.UTF8Encoding($false)))
    if (Test-Path $TestMsix) { Remove-Item $TestMsix -Force }
    & $makeappx pack /d $StagingDir /p $TestMsix /o
    if ($LASTEXITCODE -ne 0) { throw "makeappx 打包本地测试包失败，退出码 $LASTEXITCODE。" }
    Write-Host "  本地测试包已生成：$TestMsix" -ForegroundColor Green
}

# ---------- 收尾（尽量释放磁盘） ----------
if (-not $KeepStaging) { Remove-Item $StagingDir -Recurse -Force -ErrorAction SilentlyContinue }
if ($PurgeTarget) {
    $target = Join-Path $SrcTauri 'target'
    if (Test-Path $target) {
        Write-Host "  正在删除 Rust 编译缓存：$target" -ForegroundColor Yellow
        Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host " 打包完成" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
Write-Host " 商店包（上传商店）: $OutputMsix" -ForegroundColor Cyan
if ($TestMsix) { Write-Host " 本地测试包        : $TestMsix" -ForegroundColor Cyan }
Write-Host ""
Write-Host " 卸载：" -ForegroundColor DarkGray
Write-Host "   Remove-AppxPackage -Package $PackageFamilyName" -ForegroundColor DarkGray
Write-Host " 提示：未指定 -Version 时版本号自动递增，直接重新运行即可。" -ForegroundColor DarkGray