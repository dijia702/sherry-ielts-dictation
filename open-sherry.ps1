$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = "http://127.0.0.1:5173/"
$quizUrl = "${url}data/quiz-data.json"
$port = 5173
$expectedCollections = @("jian21", "jijing_supplement", "xiahua_p1p4")

function Test-SherryServer {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $quizUrl -TimeoutSec 3
    $data = $response.Content | ConvertFrom-Json
    $collectionIds = @($data.collections | ForEach-Object { $_.id })
    return (
      $response.StatusCode -eq 200 -and
      $data.questions.Count -eq 1779 -and
      @($expectedCollections | Where-Object { $_ -notin $collectionIds }).Count -eq 0
    )
  } catch {
    return $false
  }
}

if (-not (Test-SherryServer)) {
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $vite = Join-Path $workspace "node_modules\vite\bin\vite.js"
  if (-not (Test-Path -LiteralPath $vite)) {
    throw "Vite is not installed at $vite"
  }
  Start-Process `
    -FilePath $node `
    -ArgumentList @($vite, "--host=127.0.0.1", "--port=$port", "--strictPort") `
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
