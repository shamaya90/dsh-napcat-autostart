param(
  [string]$Root = 'D:\NapCatNew',
  [string]$QQ = '',
  [int]$Port = 3000
)
# Start NapCat (idempotent: exits if already running; never kills QQ.exe).
# Password (if stored) is decrypted from DPAPI into the child process environment only.
$log = Join-Path $Root 'autostart.log'
function L($m) { Add-Content -LiteralPath $log -Value ((Get-Date -Format 'MM-dd HH:mm:ss') + ' ' + $m) }
if (-not (Test-Path -LiteralPath $Root)) { L ('root not found: ' + $Root); Write-Output 'ROOT_MISSING'; exit 2 }
try { $r = Invoke-RestMethod -Uri ('http://127.0.0.1:' + $Port + '/get_login_info') -TimeoutSec 2; if ($r.status -eq 'ok' -or $r.retcode -eq 0) { Write-Output 'ALREADY_RUNNING'; return } } catch {}
$running = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.ExecutablePath -like ($Root + '\*') }).Count
if ($running -gt 0) { Write-Output 'ALREADY_RUNNING'; return }
L 'not running, starting'

$loginFile = Join-Path $env:USERPROFILE '.dsh\napcat-login.json'
if (Test-Path -LiteralPath $loginFile) {
  try {
    $j = Get-Content -LiteralPath $loginFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($j.cipher) {
      $secure = ConvertTo-SecureString -String $j.cipher
      $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
      try { $env:NAPCAT_QUICK_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
      finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
      if ($QQ) { $env:NAPCAT_QUICK_ACCOUNT = $QQ }
    }
  } catch { L 'password decrypt failed' }
}

$argsLine = $Root + '\napcat.bat'
if ($QQ) { $argsLine = $argsLine + ' -q ' + $QQ }
$argsLine = $argsLine + ' > ' + $Root + '\run.log 2>&1'
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $argsLine -WorkingDirectory $Root -WindowStyle Hidden
Write-Output 'STARTED'
