# Launches a Chromium-based browser with Delphi already loaded - skips the
# manual "enable Developer mode -> Load unpacked" steps in chrome://extensions.
# Uses a separate, throwaway profile (.dev-profile\) so it never touches your
# normal browsing profile or its extensions.
#
# Usage: .\install.ps1 [extra browser args]
# Respects $env:BROWSER if set to a full path or a name on PATH.

$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
$ProfileDir = Join-Path $ScriptDir ".dev-profile"

# Same candidate list/order as install.sh, plus the well-known Windows
# install paths for Chrome/Brave since they usually aren't on PATH there.
$Candidates = @(
  $env:BROWSER,
  "chrome",
  "chromium",
  "brave"
) | Where-Object { $_ }

$WellKnownPaths = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
  "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
  "$env:LocalAppData\BraveSoftware\Brave-Browser\Application\brave.exe"
)

$BrowserBin = $null

foreach ($candidate in $Candidates) {
  $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
  if ($cmd) {
    $BrowserBin = $cmd.Source
    break
  }
}

if (-not $BrowserBin) {
  foreach ($path in $WellKnownPaths) {
    if (Test-Path $path) {
      $BrowserBin = $path
      break
    }
  }
}

if (-not $BrowserBin) {
  Write-Error @"
No Chrome/Chromium/Brave binary found on PATH or in common install locations.
Set `$env:BROWSER to your browser's exe path and try again, e.g.:
  `$env:BROWSER = 'C:\Path\To\chrome.exe'; .\install.ps1
"@
  exit 1
}

Write-Host "Launching $BrowserBin with Delphi loaded (profile: $ProfileDir)..."
Write-Host "First run: open the toolbar puzzle-piece icon and pin Delphi. See docs\walkthrough.md for the rest."

$browserArgs = @(
  "--user-data-dir=$ProfileDir",
  "--load-extension=$ScriptDir",
  "--no-first-run"
) + $args

Start-Process -FilePath $BrowserBin -ArgumentList $browserArgs
