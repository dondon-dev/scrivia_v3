Get-CimInstance Win32_Process -Filter "Name='pocketbase.exe'" | Select-Object ProcessId,ParentProcessId,CreationDate,ExecutablePath,CommandLine | Format-List
