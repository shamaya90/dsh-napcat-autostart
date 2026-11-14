$path = Join-Path $env:USERPROFILE '.dsh\napcat-login.json'
if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force; Write-Output 'CLEARED' } else { Write-Output 'NONE' }
