# -----------------------------------------------------------------------------
# tunnel-backend.ps1
#
# Exposes the local NestJS backend (default: http://localhost:4000) to the
# public internet using Cloudflare's free "quick tunnel" service. This is what
# lets a Vercel-deployed frontend call your dev backend without deploying it.
#
# On first run the script downloads cloudflared.exe into ./scripts/bin (~40 MB).
#
# Usage:
#   powershell -File scripts\tunnel-backend.ps1
#   powershell -File scripts\tunnel-backend.ps1 -Port 4000
#
# After it prints the "https://xxxx.trycloudflare.com" URL:
#   1. Copy that URL.
#   2. In Vercel → Project → Settings → Environment Variables set
#        NEXT_PUBLIC_API_URL = https://xxxx.trycloudflare.com
#      (redeploy the frontend so it picks up the new value)
#   3. Also add the same URL to backend .env CORS_ORIGINS so the tunnel is
#      allowed to embed the API.
#
# NOTE: quick tunnels get a new random URL every restart. For a stable URL,
# create a Cloudflare account and use `cloudflared tunnel login` + a named
# tunnel — the same binary handles both.
# -----------------------------------------------------------------------------

param(
  [int]$Port = 4000
)

$ErrorActionPreference = 'Stop'

$binDir = Join-Path $PSScriptRoot 'bin'
$binPath = Join-Path $binDir 'cloudflared.exe'

if (-not (Test-Path $binDir)) {
  New-Item -ItemType Directory -Path $binDir -Force | Out-Null
}

if (-not (Test-Path $binPath)) {
  Write-Host 'Downloading cloudflared.exe (~40 MB, one-time)...' -ForegroundColor Cyan
  $url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
  Invoke-WebRequest -Uri $url -OutFile $binPath -UseBasicParsing
  Write-Host "Saved to $binPath" -ForegroundColor Green
}

Write-Host ''
Write-Host "Exposing http://localhost:$Port via Cloudflare Quick Tunnel..." -ForegroundColor Cyan
Write-Host 'Look for a line like:  https://<random>.trycloudflare.com' -ForegroundColor Yellow
Write-Host 'Press Ctrl+C to stop the tunnel.' -ForegroundColor DarkGray
Write-Host ''

& $binPath tunnel --url "http://localhost:$Port" --no-autoupdate
