param(
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_-]*$')][string]$Profile = 'web',
    [switch]$Uninstall,
    [switch]$Preview,
    [string]$StoreDir
)
$ErrorActionPreference = 'Stop'
$installerArgs = @('--yes', 'useful-dsh-plugins@0.5.0')
if ($Uninstall) {
    $installerArgs += 'uninstall'
} else {
    $installerArgs += 'setup'
}
$installerArgs += @('--profile', $Profile)
if ($Preview) { $installerArgs += '--preview' }
if ($StoreDir) { $installerArgs += @('--store-dir', $StoreDir) }
& npx @installerArgs
if ($LASTEXITCODE -ne 0) { throw 'Plugin installer did not complete. Inspect its recovery record before retrying.' }
