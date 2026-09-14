$ErrorActionPreference = 'SilentlyContinue'
$dir = 'C:\Users\Pawan\OneDrive\Desktop\opencode\quantfolio'
$port = 5173

$busy = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
if (-not $busy) {
  Start-Process node -ArgumentList 'server.js' -WorkingDirectory $dir -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $dir 'server.log') `
    -RedirectStandardError (Join-Path $dir 'server.err.log')
  Start-Sleep -Seconds 3
}
