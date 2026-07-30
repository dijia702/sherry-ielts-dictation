param(
  [string]$InstalledAsar = "E:\li\sherry-ielts-dictation\resources\app.asar",
  [string]$ReleaseAsar = "E:\listening\release-good\win-unpacked\resources\app.asar"
)

$ErrorActionPreference = "Stop"

foreach ($path in @($InstalledAsar, $ReleaseAsar)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing app archive: $path"
  }
}

$installedHash = (Get-FileHash -LiteralPath $InstalledAsar -Algorithm SHA256).Hash
$releaseHash = (Get-FileHash -LiteralPath $ReleaseAsar -Algorithm SHA256).Hash
$matches = $installedHash -eq $releaseHash

[pscustomobject]@{
  InstalledAsar = $InstalledAsar
  ReleaseAsar = $ReleaseAsar
  InstalledSHA256 = $installedHash
  ReleaseSHA256 = $releaseHash
  Matches = $matches
} | Format-List

if (-not $matches) {
  exit 1
}
