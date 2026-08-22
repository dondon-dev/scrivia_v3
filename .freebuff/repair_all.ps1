cd /c/scriviacloud

echo "Repairing migration history (106 migrations)..."
while IFS= read -r ts; do
  supabase migration repair --status applied "$ts" 2>/dev/null
  printf "."
done < .freebuff/repair_timestamps.txt
echo ""
echo "DONE repairing all migrations"
