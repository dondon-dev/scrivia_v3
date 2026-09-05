Add-Type -AssemblyName System.Windows.Forms

$form = New-Object System.Windows.Forms.Form
$form.Text = "Dev Server Control"
$form.Size = New-Object System.Drawing.Size(300,150)

$startButton = New-Object System.Windows.Forms.Button
$startButton.Text = "START"
$startButton.Location = New-Object System.Drawing.Point(30,30)

$stopButton = New-Object System.Windows.Forms.Button
$stopButton.Text = "STOP"
$stopButton.Location = New-Object System.Drawing.Point(150,30)

$form.Controls.Add($startButton)
$form.Controls.Add($stopButton)

$startButton.Add_Click({
    Start-Process powershell -ArgumentList "-NoExit","-Command","cd C:\scriviacloudV2\pocketbase_bin; .\pocketbase.exe serve --http=0.0.0.0:8090"
    Start-Process powershell -ArgumentList "-NoExit","-Command","cd C:\scriviacloudV2\frontend; npm run dev"
})

$stopButton.Add_Click({
    Get-Process pocketbase -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
})

$form.ShowDialog()