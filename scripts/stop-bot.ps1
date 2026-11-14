param([string]$Root = 'D:\NapCatNew')
# Stop only NapCat's own node.exe (never touches QQ.exe).
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.ExecutablePath -like ($Root + '\*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Output 'STOPPED'
