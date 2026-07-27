# Stop FinAlly. Idempotent: safe to run repeatedly. Never removes the data volume.
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$Container = "finally"

$existing = docker ps -aq -f "name=^$Container$"
if ($existing) {
    docker rm -f $Container | Out-Null
    Write-Host "Stopped and removed the $Container container. The finally-data volume is kept."
} else {
    Write-Host "No $Container container found; nothing to do."
}
