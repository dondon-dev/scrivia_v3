Add-Type -AssemblyName System.Windows.Forms

$form = New-Object System.Windows.Forms.Form
$form.Text = "Dev Server Control"
$form.Size = New-Object System.Drawing.Size(420,150)
$form.StartPosition = "CenterScreen"

$startButton = New-Object System.Windows.Forms.Button
$startButton.Text = "START ALL"
$startButton.Location = New-Object System.Drawing.Point(20,30)
$startButton.Size = New-Object System.Drawing.Size(100,40)

$tunnelButton = New-Object System.Windows.Forms.Button
$tunnelButton.Text = "RUN TUNNEL"
$tunnelButton.Location = New-Object System.Drawing.Point(140,30)
$tunnelButton.Size = New-Object System.Drawing.Size(100,40)

$stopButton = New-Object System.Windows.Forms.Button
$stopButton.Text = "STOP ALL"
$stopButton.Location = New-Object System.Drawing.Point(260,30)
$stopButton.Size = New-Object System.Drawing.Size(100,40)

$form.Controls.Add($startButton)
$form.Controls.Add($tunnelButton)
$form.Controls.Add($stopButton)

$startButton.Add_Click({

    Start-Process powershell.exe -ArgumentList '-NoExit','-Command','cd C:\scriviacloudV2\pocketbase_bin; .\pocketbase.exe serve --http=127.0.0.1:8090 --dir=pb_data'

    Start-Process powershell.exe -ArgumentList '-NoExit','-Command','cd C:\scriviacloudV2\pocketbase_bin; .\litestream.exe replicate -config .\litestream.yml'

    Start-Process powershell.exe -ArgumentList '-NoExit','-Command','cd C:\scriviacloudV2\frontend; npm run dev'

    Start-Process powershell.exe -ArgumentList '-NoExit','-Command','cloudflared tunnel run'

})

$tunnelButton.Add_Click({

    Start-Process powershell.exe -ArgumentList '-NoExit','-Command','cloudflared tunnel run'

})

$stopButton.Add_Click({

    Get-Process pocketbase -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-Process litestream -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force

})

[void]$form.ShowDialog()