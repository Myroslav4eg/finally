# Start FinAlly in Docker. Idempotent: safe to run repeatedly.
# Usage: .\scripts\start_windows.ps1 [-Build] [-NoOpen]
[CmdletBinding()]
param(
    [switch]$Build,
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$Image = "finally"
$Container = "finally"
$Volume = "finally-data"
$Port = 8000

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Test-Path ".env")) {
    Write-Host "No .env found; creating one from .env.example."
    Copy-Item ".env.example" ".env"
    Write-Host "Edit .env to add your OPENROUTER_API_KEY before using the AI chat."
}

docker image inspect $Image *> $null
if ($Build -or $LASTEXITCODE -ne 0) {
    Write-Host "Building $Image image..."
    docker build -t $Image .
    if ($LASTEXITCODE -ne 0) { throw "Docker build failed." }
}

docker volume create $Volume | Out-Null

$existing = docker ps -aq -f "name=^$Container$"
if ($existing) {
    Write-Host "Removing existing $Container container (the $Volume volume is kept)."
    docker rm -f $Container | Out-Null
}

docker run -d --name $Container `
    -p "${Port}:8000" `
    -v "${Volume}:/app/db" `
    --env-file .env `
    $Image | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to start the $Container container." }

$url = "http://localhost:$Port"
Write-Host "Waiting for FinAlly to become healthy..."
foreach ($i in 1..60) {
    try {
        Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
        Write-Host "FinAlly is running at $url"
        if (-not $NoOpen) { Start-Process $url }
        exit 0
    } catch {
        Start-Sleep -Seconds 1
    }
}

Write-Host "FinAlly did not become healthy within 60 seconds. Recent logs:"
docker logs --tail 40 $Container
exit 1
