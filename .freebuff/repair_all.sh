#!/bin/bash
cd /c/scriviacloud
# Run repair commands from the extracted list
while IFS= read -r cmd; do
  $cmd 2>/dev/null
done < .freebuff/repair_commands.txt
echo "=== ALL REPAIRS COMPLETE ==="
