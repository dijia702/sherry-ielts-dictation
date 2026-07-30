$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = "http://127.0.0.1:5173/"
$port = 5173

function Test-SherryServer {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

if (-not (Test-SherryServer)) {
  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  Start-Process `
    -FilePath $npm `
    -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1", "--port", "$port") `
    -WorkingDirectory $workspace `
    -WindowStyle Hidden

  $ready = $false
  foreach ($attempt in 1..30) {
    Start-Sleep -Milliseconds 500
    if (Test-SherryServer) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    throw "Sherry dictation server did not start within 15 seconds."
  }
}

Start-Process $url
