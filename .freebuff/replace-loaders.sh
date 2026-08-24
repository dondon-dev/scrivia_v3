#!/bin/bash
# Replace ScriviaLogo animate-pulse loading patterns with LoadingIndicator

FILES=(
  "src/components/ClassifiedExportModal.tsx"
  "src/components/DeleteAllConfirm.tsx"
  "src/components/InitialEmployeeImportModal.tsx"
  "src/components/SchoolImportModal.tsx"
  "src/components/SchoolManagement.tsx"
  "src/views/AiCommandCenter.tsx"
  "src/views/auth/EmailVerification.tsx"
  "src/views/CommAllowance.tsx"
  "src/views/CommAllowancePayroll.tsx"
  "src/views/Dashboard.tsx"
  "src/views/DivisionOffice.tsx"
  "src/views/GsisImport.tsx"
  "src/views/NameValidation.tsx"
  "src/views/Organization.tsx"
  "src/views/Payroll.tsx"
  "src/views/PayrollDbfManager.tsx"
  "src/views/PayrollDefinitions.tsx"
  "src/views/PlantillaPositions.tsx"
  "src/views/PliImport.tsx"
  "src/views/PositionManagement.tsx"
  "src/views/RegionsDivisions.tsx"
  "src/views/RestoreData.tsx"
  "src/views/SmartImport.tsx"
  "src/views/StacodeValidation.tsx"
  "src/views/UserManagement.tsx"
)

for f in "${FILES[@]}"; do
  if [ -f "/c/scriviacloud/$f" ]; then
    # Add import if not already present
    if ! grep -q "LoadingIndicator" "/c/scriviacloud/$f"; then
      # Find the last import line and add LoadingIndicator after it
      sed -i '/^import /{ h; }; ${x; /^import /{ s/$/\nimport LoadingIndicator from '\''@\/components\/LoadingIndicator'\'';/; H; x; }; }' "/c/scriviacloud/$f" 2>/dev/null || true
    fi
  fi
done
echo "Done adding imports"
