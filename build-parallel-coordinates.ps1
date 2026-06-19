$src = "G:\My Drive\ThermalEngineeringTools\parallel-coordinates"
$temp = "C:\Users\tsanz\parallel_coords_build"

Write-Host "Cleaning up old temp folders..."
Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue

Write-Host "Creating temp directory: $temp"
New-Item -ItemType Directory -Force -Path $temp

Write-Host "Copying project source files..."
Copy-Item "$src\package.json" "$temp\"
Copy-Item "$src\vite.config.ts" "$temp\"
Copy-Item "$src\tsconfig.json" "$temp\"
Copy-Item "$src\tsconfig.app.json" "$temp\"
Copy-Item "$src\tsconfig.node.json" "$temp\"
Copy-Item "$src\index.html" "$temp\"
Copy-Item -Recurse "$src\src" "$temp\"

Write-Host "Installing dependencies on local drive..."
Set-Location -Path $temp
npm install --no-audit --no-fund

Write-Host "Compiling the application..."
npm run build

Write-Host "Copying built assets back to Google Drive..."
Remove-Item -Recurse -Force "$src\dist" -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$src\dist"
Copy-Item -Recurse "$temp\dist\*" "$src\dist\"

Write-Host "Cleaning up temp files..."
Set-Location -Path "C:\Users\tsanz"
Remove-Item -Recurse -Force $temp

Write-Host "Build workaround finished successfully!"
