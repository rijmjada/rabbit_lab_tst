<#
.SYNOPSIS
  Levanta (o detiene) todo el stack de RabbitMQ Playground: RabbitMQ (Docker),
  backend (Spring Boot) y frontend (Vite), en orden y esperando a que cada
  pieza esté lista antes de seguir con la siguiente.

.USAGE
  .\start.ps1          # levanta todo
  .\start.ps1 -Stop    # detiene todo (contenedores + procesos backend/frontend)

  Si PowerShell bloquea el script por la policy de ejecución, correr:
  powershell -ExecutionPolicy Bypass -File .\start.ps1
#>

[CmdletBinding()]
param(
    [switch]$Stop
)

$RootDir = $PSScriptRoot
$ComposeFile = Join-Path $RootDir "docker-compose.yml"
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"
$LogsDir = Join-Path $RootDir "logs"
$BackendLog = Join-Path $LogsDir "backend.log"
$FrontendLog = Join-Path $LogsDir "frontend.log"
$RabbitContainer = "rabbitmq-playground-broker"
$BackendPort = 8080
$FrontendPort = 5173

function Test-PortOpen {
    # Chequea si hay un listener en el puerto (IPv4 o IPv6) en vez de intentar
    # conectar: Vite en Windows a veces escucha solo en [::1], y un connect
    # contra "localhost" puede resolver primero a 127.0.0.1 y fallar igual
    # aunque el puerto esté activo.
    param([int]$Port)
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-ForPort {
    param([int]$Port, [string]$Label, [int]$TimeoutSeconds = 180)
    Write-Host "Esperando a que $Label responda en el puerto $Port..." -ForegroundColor Yellow
    $elapsed = 0
    while (-not (Test-PortOpen -Port $Port)) {
        Start-Sleep -Seconds 2
        $elapsed += 2
        if ($elapsed -ge $TimeoutSeconds) {
            Write-Host "  Timeout esperando $Label en el puerto $Port (revisá el log en la carpeta logs\ por errores)." -ForegroundColor Red
            return $false
        }
    }
    Write-Host "  $Label listo." -ForegroundColor Green
    return $true
}

function Stop-ProcessOnPort {
    param([int]$Port, [string]$Label)
    $ownerPids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($ownerPid in $ownerPids) {
        try {
            $proc = Get-Process -Id $ownerPid -ErrorAction Stop
            Write-Host "Deteniendo $Label (PID $ownerPid, $($proc.ProcessName))..." -ForegroundColor Yellow
            Stop-Process -Id $ownerPid -Force
        } catch {}
    }
}

if ($Stop) {
    Write-Host "== Deteniendo RabbitMQ Playground ==" -ForegroundColor Cyan
    Stop-ProcessOnPort -Port $FrontendPort -Label "frontend (Vite)"
    Stop-ProcessOnPort -Port $BackendPort -Label "backend (Spring Boot)"
    docker compose -f $ComposeFile down
    Write-Host "Listo, todo detenido." -ForegroundColor Green
    exit 0
}

Write-Host "== Levantando RabbitMQ Playground ==" -ForegroundColor Cyan

if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir | Out-Null
}

# 1) RabbitMQ
Write-Host "Levantando RabbitMQ con docker compose..." -ForegroundColor Yellow
docker compose -f $ComposeFile up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "docker compose falló. ¿Está Docker Desktop corriendo?" -ForegroundColor Red
    exit 1
}

Write-Host "Esperando a que RabbitMQ esté 'healthy'..." -ForegroundColor Yellow
$elapsed = 0
while ($true) {
    $status = docker inspect --format '{{.State.Health.Status}}' $RabbitContainer 2>$null
    if ($status -eq "healthy") { break }
    Start-Sleep -Seconds 2
    $elapsed += 2
    if ($elapsed -ge 90) {
        Write-Host "  RabbitMQ no llegó a 'healthy' en 90s, sigo igual (puede tardar un poco más en arrancar)." -ForegroundColor Red
        break
    }
}
Write-Host "  RabbitMQ listo." -ForegroundColor Green

# 2) Backend
if (Test-PortOpen -Port $BackendPort) {
    Write-Host "El backend ya está corriendo en el puerto $BackendPort, no lo vuelvo a levantar." -ForegroundColor Yellow
} else {
    Write-Host "Levantando backend (Spring Boot) en segundo plano (log: $BackendLog)..." -ForegroundColor Yellow
    Remove-Item $BackendLog -ErrorAction SilentlyContinue
    Start-Process cmd.exe -ArgumentList "/c", "cd /d `"$BackendDir`" && mvn spring-boot:run >> `"$BackendLog`" 2>&1" -WindowStyle Hidden
    Wait-ForPort -Port $BackendPort -Label "backend" -TimeoutSeconds 180 | Out-Null
}

# 3) Frontend
if (Test-PortOpen -Port $FrontendPort) {
    Write-Host "El frontend ya está corriendo en el puerto $FrontendPort, no lo vuelvo a levantar." -ForegroundColor Yellow
} else {
    Write-Host "Levantando frontend (Vite) en segundo plano (log: $FrontendLog)..." -ForegroundColor Yellow
    Remove-Item $FrontendLog -ErrorAction SilentlyContinue
    Start-Process cmd.exe -ArgumentList "/c", "cd /d `"$FrontendDir`" && npm run dev >> `"$FrontendLog`" 2>&1" -WindowStyle Hidden
    Wait-ForPort -Port $FrontendPort -Label "frontend" -TimeoutSeconds 60 | Out-Null
}

Write-Host ""
Write-Host "== Todo arriba ==" -ForegroundColor Cyan
Write-Host "RabbitMQ management: http://localhost:15672 (guest/guest)"
Write-Host "Backend:             http://localhost:$BackendPort"
Write-Host "Frontend:            http://localhost:$FrontendPort"
Write-Host ""
Write-Host "Backend y frontend corren ocultos en segundo plano (sin ventanas nuevas). Para ver sus logs en vivo:" -ForegroundColor DarkGray
Write-Host "  Get-Content '$BackendLog' -Wait" -ForegroundColor DarkGray
Write-Host "  Get-Content '$FrontendLog' -Wait" -ForegroundColor DarkGray
Write-Host "Para detener todo: .\start.ps1 -Stop" -ForegroundColor DarkGray

Start-Process "http://localhost:$FrontendPort"
