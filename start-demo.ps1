$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$apiRoot = Join-Path $projectRoot "apps\api"
$venvPython = Join-Path $apiRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $venvPython)) { throw "Run .\setup-demo.ps1 first." }

$runtimeRoot = Join-Path $projectRoot ".runtime"
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$apiLog = Join-Path $runtimeRoot "api.log"
$apiErrorLog = Join-Path $runtimeRoot "api-error.log"
$webLog = Join-Path $runtimeRoot "web.log"
$webErrorLog = Join-Path $runtimeRoot "web-error.log"

$apiProcess = Start-Process -FilePath $venvPython -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001" -WorkingDirectory $apiRoot -RedirectStandardOutput $apiLog -RedirectStandardError $apiErrorLog -WindowStyle Hidden -PassThru
$webProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev:web", "--", "--port", "3001" -WorkingDirectory $projectRoot -RedirectStandardOutput $webLog -RedirectStandardError $webErrorLog -WindowStyle Hidden -PassThru

Write-Host "NER-LOGIX is starting..."
Write-Host "Web:     http://localhost:3001"
Write-Host "API:     http://localhost:8001/docs"
Write-Host "Logs:    $runtimeRoot"
Write-Host "Process: API $($apiProcess.Id), Web $($webProcess.Id)"
