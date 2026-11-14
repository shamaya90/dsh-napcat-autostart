# Read QQ password from env NAPCAT_PLAIN, encrypt with Windows DPAPI (current user),
# write to %USERPROFILE%\.dsh\napcat-login.json. No plaintext on disk.
$secretText = $env:NAPCAT_PLAIN
$env:NAPCAT_PLAIN = $null
if ([string]::IsNullOrEmpty($secretText)) { Write-Output 'EMPTY'; exit 2 }
$secure = ConvertTo-SecureString -String $secretText -AsPlainText -Force
$cipher = ConvertFrom-SecureString -SecureString $secure
$obj = [ordered]@{ ver = 1; cipher = $cipher; savedAt = (Get-Date).ToString('s') }
$path = Join-Path $env:USERPROFILE '.dsh\napcat-login.json'
New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
$obj | ConvertTo-Json | Set-Content -LiteralPath $path -Encoding UTF8
Write-Output 'OK'
