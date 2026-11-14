# Execute the documented Windows setup without model credentials or paid requests.
$ErrorActionPreference = 'Stop'
$readme = Get-Content (Join-Path $PSScriptRoot '..' 'README.md') -Raw
$blocks = @([regex]::Matches($readme, '(?ms)^```powershell\r?\n(.*?)^```') | ForEach-Object { $_.Groups[1].Value.Trim() })
if ($blocks.Count -ne 2) { throw 'Expected the setup and gateway URL PowerShell blocks in README' }
$commands = @($blocks[0] -split '\r?\n' | Where-Object { $_.Trim() })
if ($commands.Count -ne 3) { throw 'Expected virtualenv, installation, and server commands in README' }
$npx = [regex]::Match($readme, 'use `(npx\.[^`]+)` instead of `npx`').Groups[1].Value
if (!$npx) { throw 'README must identify the Windows npx command' }
& $npx --version
if ($LASTEXITCODE -ne 0) { throw 'The documented npx command failed' }

$work = Join-Path $env:RUNNER_TEMP ('mlflow-setup-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $work | Out-Null
$process = $null
Push-Location $work
try {
    foreach ($command in $commands[0..1]) {
        & ([scriptblock]::Create($command))
        if ($LASTEXITCODE -ne 0) { throw "Setup command failed: $command" }
    }
    & .\.venv\Scripts\python.exe -m pip check
    if ($LASTEXITCODE -ne 0) { throw 'Installed MLflow dependencies are incompatible' }
    & ([scriptblock]::Create($blocks[1]))
    if ($env:MLFLOW_GATEWAY_URL -ne 'http://127.0.0.1:5000') { throw 'Unexpected documented gateway URL' }
    # Fail if another listener could satisfy the health check for this server.
    $portCheck = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::IPv6Any, 5000)
    $portCheck.Server.DualMode = $true
    try { $portCheck.Start() } finally { $portCheck.Stop() }
    $env:MLFLOW_ENABLE_TELEMETRY = 'false'
    $env:OPENBLAS_NUM_THREADS = '1'
    $env:OMP_NUM_THREADS = '1'
    $script = Join-Path $work 'start-server.ps1'
    Set-Content $script ('$ErrorActionPreference = "Stop"' + "`n" + $commands[2] + "`nexit " + '$LASTEXITCODE')
    $stdout = Join-Path $work 'server.stdout.log'
    $stderr = Join-Path $work 'server.stderr.log'
    $process = Start-Process (Get-Command pwsh).Source -ArgumentList @('-NoProfile', '-File', ('"{0}"' -f $script)) -WorkingDirectory $work -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    $deadline = (Get-Date).AddSeconds(120)
    $healthy = $false
    $lastHealthError = 'No HTTP response received'
    Write-Output ('PowerShell ' + $PSVersionTable.PSVersion + '; localhost addresses: ' + ([System.Net.Dns]::GetHostAddresses('localhost') -join ', '))
    while ((Get-Date) -lt $deadline) {
        $process.Refresh()
        if ($process.HasExited) { throw 'The documented MLflow server command exited before becoming healthy' }
        try {
            $response = Invoke-WebRequest ($env:MLFLOW_GATEWAY_URL + '/health') -NoProxy -TimeoutSec 2
            if ($response.StatusCode -eq 200) { $healthy = $true; break }
        } catch {
            $lastHealthError = $_.Exception.Message
            Start-Sleep -Seconds 1
        }
    }
    if (!$healthy) { throw "The documented MLflow server did not become healthy in 120 seconds: $lastHealthError" }
    Write-Output 'Documented PowerShell install, server startup, gateway URL, and npx command passed.'
} finally {
    if ($process -and !$process.HasExited) {
        & taskkill /PID $process.Id /T /F
        $process.WaitForExit()
    }
    if (Test-Path 'server.stdout.log') { Get-Content 'server.stdout.log' }
    if (Test-Path 'server.stderr.log') { Get-Content 'server.stderr.log' }
    Pop-Location
}
# taskkill can report an already-exited child after successfully stopping the tree.
# A setup or health exception still terminates above; only a successful check reaches here.
exit 0
