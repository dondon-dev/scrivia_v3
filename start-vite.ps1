$proc = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -WorkingDirectory 'C:\scriviacloudV2\frontend' -RedirectStandardOutput 'C:\scriviacloudV2\.freebuff\preview-1e3f1f2e-36df-414f-b995-2a0e7093a1f4.log' -RedirectStandardError 'C:\scriviacloudV2\.freebuff\preview-1e3f1f2e-36df-414f-b995-2a0e7093a1f4.log.err' -WindowStyle Hidden -PassThru
Write-Host "Vite PID: $($proc.Id)"
