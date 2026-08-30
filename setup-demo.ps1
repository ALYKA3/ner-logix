$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
Set-Location -LiteralPath $projectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 20+ is required." }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw "Python 3.12+ is required." }

$apiRoot = Join-Path $projectRoot "apps\api"
$venvPython = Join-Path $apiRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $venvPython)) {
    python -m venv (Join-Path $apiRoot ".venv")
}
& $venvPython -m pip install -r (Join-Path $apiRoot "requirements.txt")
npm install

$webEnvironment = Join-Path $projectRoot "apps\web\.env.local"
if (-not (Test-Path -LiteralPath $webEnvironment)) {
    Copy-Item -LiteralPath (Join-Path $projectRoot "apps\web\.env.local.example") -Destination $webEnvironment
}

Write-Host "NER-LOGIX dependencies are ready. Run .\start-demo.ps1"
