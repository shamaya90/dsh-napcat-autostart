# 把插件发布到 npm（需要先登录/或配置 token）
# 用法：右键 PowerShell 运行，或  powershell -ExecutionPolicy Bypass -File release.ps1
$node = 'C:\Users\qwrr\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$pnpm = 'C:\Users\qwrr\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs'
Set-Location $PSScriptRoot
if (-not (Test-Path $node)) { Write-Error ('node not found: ' + $node); exit 1 }
& $node $pnpm publish --access public --no-git-checks --registry https://registry.npmjs.org/
exit $LASTEXITCODE
