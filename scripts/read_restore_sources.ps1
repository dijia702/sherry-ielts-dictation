$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputRoot = "E:\listening\output\system-recovery-read-$timestamp"
New-Item -ItemType Directory -Path $outputRoot | Out-Null

$report = [ordered]@{
  capturedAt = (Get-Date).ToString("o")
  shadows = @()
  copiedSources = @()
  errors = @()
}

try {
  $report.vssadmin = (& vssadmin list shadows 2>&1 | Out-String)
} catch {
  $report.errors += "vssadmin: $($_.Exception.Message)"
}

try {
  $report.wbadmin = (& wbadmin get versions 2>&1 | Out-String)
} catch {
  $report.errors += "wbadmin: $($_.Exception.Message)"
}

try {
  $restorePoints = Get-ComputerRestorePoint | Select-Object SequenceNumber, Description, CreationTime, RestorePointType
  $report.restorePoints = @($restorePoints)
} catch {
  $report.errors += "restore points: $($_.Exception.Message)"
}

$shadows = Get-CimInstance -ClassName Win32_ShadowCopy | Sort-Object InstallDate
foreach ($shadow in $shadows) {
  $shadowInfo = [ordered]@{
    id = $shadow.ID
    installedAt = $shadow.InstallDate
    volume = $shadow.VolumeName
    device = $shadow.DeviceObject
  }
  $report.shadows += $shadowInfo

  $sourceCandidates = @(
    "$($shadow.DeviceObject)\Users\DELL\AppData\Local\Microsoft\Edge\User Data\Default\Local Storage\leveldb",
    "$($shadow.DeviceObject)\Users\DELL\AppData\Roaming\sherry-ielts-dictation\Local Storage\leveldb"
  )

  foreach ($source in $sourceCandidates) {
    if (-not (Test-Path -LiteralPath $source)) { continue }
    $safeId = ($shadow.ID -replace '[{}]', '')
    $sourceName = if ($source -match 'Microsoft\\Edge') { 'edge' } else { 'desktop-app' }
    $destination = Join-Path $outputRoot "$safeId-$sourceName"
    New-Item -ItemType Directory -Path $destination | Out-Null
    Get-ChildItem -LiteralPath $source -File |
      Where-Object { $_.Name -match '^(CURRENT|MANIFEST-.*|.*\.(ldb|log))$' } |
      Copy-Item -Destination $destination
    $report.copiedSources += [ordered]@{
      shadowId = $shadow.ID
      source = $source
      destination = $destination
      files = @(Get-ChildItem -LiteralPath $destination -File | Select-Object Name, Length, LastWriteTime)
    }
  }
}

$report | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $outputRoot 'report.json') -Encoding UTF8
Write-Output $outputRoot
