# =====================================================================
#  MiauNoteBlock 打包构建脚本 (仅 Windows 绿色版 exe)
#  用法: 以管理员身份运行 run-as-admin.bat (它会自动提权调用本脚本)
#  产物: 统一输出到 packaging\dist
# =====================================================================
[CmdletBinding()]
param(
    [switch]$NoExclusion     # 不尝试添加 Defender 排除目录
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# ---------------- 路径 ----------------
$PkgDir    = $PSScriptRoot
$RootDir   = Split-Path $PkgDir -Parent
$Tauri     = Join-Path $RootDir 'node_modules\.bin\tauri.cmd'
$DistDir   = Join-Path $PkgDir 'dist'
$SrcTauri  = Join-Path $PkgDir 'src-tauri'
$FrontDist = Join-Path $RootDir 'blbl-toy'

function Info($m) { Write-Host "[*]  $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[OK] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[!]  $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "[X]  $m" -ForegroundColor Red; exit 1 }

# ---------------- 前置检查 ----------------
if (-not (Test-Path $Tauri)) {
    Die "未找到 Tauri CLI: $Tauri`n请先在项目根目录执行: npm install"
}
if (-not (Test-Path $FrontDist)) {
    Die "未找到前端产物: $FrontDist`n请先执行项目根目录的 build_local.bat (生成 blbl-toy)"
}
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Warn "当前不是管理员身份。编译产物可能被安全软件拦截 (os error 5)。建议通过 run-as-admin.bat 运行。"
}

# ---------------- 环境变量 ----------------
$env:CARGO_TERM_COLOR = 'never'
$env:CARGO_BUILD_JOBS  = '1'   # 单线程: 规避安全软件对新建 exe 的并发拦截

# ---------------- 安全软件排除 (关键: 解决 os error 5) ----------------
if (-not $NoExclusion -and $isAdmin) {
    try {
        Add-MpPreference -ExclusionPath $PkgDir -ErrorAction Stop
        Ok "已为 Windows Defender 添加排除目录: $PkgDir"
    } catch {
        Warn "无法通过 Defender 添加排除 (可能已被第三方安全软件接管)。"
        Warn "请手动在本机杀毒软件中把以下目录加入白名单, 再重新运行:"
        Warn "     $PkgDir"
    }
}

# ---------------- 工具函数 ----------------
function Invoke-Tauri {
    param([string[]]$TauriArgs)
    Push-Location $PkgDir
    try { & $Tauri @TauriArgs } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { Die "tauri $($TauriArgs -join ' ') 执行失败 (exit=$LASTEXITCODE)" }
}

# ---------------- Windows 绿色版 exe ----------------
function Build-Windows {
    Info "==== 构建 Windows 绿色版 exe (免安装) ===="
    Invoke-Tauri @('build', '--no-bundle')
    $relDir = Join-Path $SrcTauri 'target\release'
    $exe = Join-Path $relDir 'MiauNoteBlock.exe'
    if (-not (Test-Path $exe)) {
        $found = Get-ChildItem $relDir -Filter '*.exe' -ErrorAction SilentlyContinue |
                 Where-Object { $_.Name -notmatch 'build-script' } |
                 Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($found) { $exe = $found.FullName }
    }
    if ($exe -and (Test-Path $exe)) {
        Copy-Item $exe $DistDir -Force
        Ok "Windows 绿色版: $(Split-Path $exe -Leaf)  (免安装, 双击即用)"
    } else {
        Warn "未找到 exe 产物, 请检查上方构建日志"
    }
}

# ---------------- 主流程 ----------------
$sw = [System.Diagnostics.Stopwatch]::StartNew()
Build-Windows
$sw.Stop()

Write-Host ""
Ok "全部完成, 用时 $([int]$sw.Elapsed.TotalMinutes) 分 $($sw.Elapsed.Seconds) 秒"
Write-Host "产物目录: $DistDir" -ForegroundColor Cyan
Get-ChildItem $DistDir -File -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host ("  - {0}  ({1:N1} MB)" -f $_.Name, ($_.Length / 1MB))
}
Write-Host ""