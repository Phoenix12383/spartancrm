# audit-modules-fast.ps1 - Skip CAD file
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MODULE DEPENDENCY AUDIT (Skipping CAD)" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Get all module files EXCEPT 04-cad-integration.js
$modules = Get-ChildItem .\modules\*.js | Where-Object { $_.Name -ne '04-cad-integration.js' } | Sort-Object Name

Write-Host "Analyzing $($modules.Count) modules (skipping 04-cad-integration.js)" -ForegroundColor Yellow
Write-Host ""

$report = @()
$allDefines = @{}
$allUses = @{}

foreach ($mod in $modules) {
    $content = Get-Content $mod.FullName -Raw
    $name = $mod.Name
    $sizeKB = [math]::Round($mod.Length / 1KB, 1)
    
    Write-Host "Analyzing: $name ($sizeKB KB)" -ForegroundColor Yellow
    
    # Find variable/function definitions
    $defines = @()
    
    # var/let/const declarations
    $varMatches = [regex]::Matches($content, '(?m)^\s*(var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)')
    foreach ($m in $varMatches) {
        $defines += $m.Groups[2].Value
    }
    
    # function declarations
    $funcMatches = [regex]::Matches($content, '(?m)^\s*function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(')
    foreach ($m in $funcMatches) {
        $defines += $m.Groups[1].Value
    }
    
    # Find what this module uses
    $uses = @()
    
    # Function calls
    $callMatches = [regex]::Matches($content, '\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(')
    foreach ($m in $callMatches) {
        $call = $m.Groups[1].Value
        $keywords = @('if', 'for', 'while', 'switch', 'return', 'typeof', 'console', 'JSON', 'Math', 'Object', 'Array', 'String', 'Number', 'Boolean', 'parseInt', 'parseFloat', 'isNaN', 'undefined', 'null', 'true', 'false', 'this', 'new', 'delete', 'in', 'instanceof', 'void', 'document', 'window', 'localStorage', 'alert', 'confirm', 'setTimeout', 'setInterval', 'clearTimeout', 'addEventListener', 'fetch', 'Promise', 'Date', 'RegExp', 'Error')
        if ($call -notin $keywords -and $call -ne '') {
            $uses += $call
        }
    }
    
    $defines = $defines | Sort-Object -Unique
    $uses = $uses | Sort-Object -Unique | Select-Object -First 30
    
    $allDefines[$name] = $defines
    $allUses[$name] = $uses
    
    $report += "`n=== $name ==="
    $report += "Defines: $($defines -join ', ')"
    $report += "Uses: $($uses -join ', ')"
    
    Write-Host "  Defines: $($defines.Count) items" -ForegroundColor Green
    Write-Host "  Uses: $($uses.Count) items" -ForegroundColor Gray
}

# Save report
$report | Out-File .\audit\module-report-fast.txt
Write-Host "`nReport saved to audit\module-report-fast.txt" -ForegroundColor Green

# Find what each module depends on that's not defined in itself
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "DEPENDENCIES (what each module needs from others)" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Build global definition map
$globalDefs = @{}
foreach ($mod in $allDefines.Keys) {
    foreach ($def in $allDefines[$mod]) {
        if ($def -ne '') {
            $globalDefs[$def] = $mod
        }
    }
}

foreach ($mod in $allUses.Keys) {
    $needsFromOthers = @()
    foreach ($use in $allUses[$mod]) {
        if ($use -notin $allDefines[$mod] -and $use -in $globalDefs.Keys) {
            $needsFromOthers += "$use (from $($globalDefs[$use]))"
        }
    }
    if ($needsFromOthers.Count -gt 0) {
        Write-Host "$mod needs:" -ForegroundColor Yellow
        foreach ($need in $needsFromOthers | Select-Object -First 10) {
            Write-Host "  - $need" -ForegroundColor Gray
        }
    }
}

# Suggested load order based on dependencies
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "SUGGESTED LOAD ORDER" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Green

# Build dependency graph
$deps = @{}
foreach ($mod in $allUses.Keys) {
    $deps[$mod] = @()
    foreach ($use in $allUses[$mod]) {
        if ($use -in $globalDefs.Keys -and $use -notin $allDefines[$mod]) {
            $defMod = $globalDefs[$use]
            if ($defMod -ne $mod -and $defMod -ne '') {
                $deps[$mod] += $defMod
            }
        }
    }
    $deps[$mod] = $deps[$mod] | Sort-Object -Unique
}

# Simple topological sort
$loadOrder = @()
$loaded = @{}
$remaining = $modules | ForEach-Object { $_.Name } | Sort-Object

# Modules with no dependencies first
$pass = 0
while ($remaining.Count -gt 0 -and $pass -lt 20) {
    $next = @()
    foreach ($mod in $remaining) {
        $unmetDeps = $deps[$mod] | Where-Object { $_ -notin $loaded.Keys -and $_ -ne '' }
        if ($unmetDeps.Count -eq 0) {
            $next += $mod
        }
    }
    if ($next.Count -eq 0) {
        # Circular dependency - add remaining as-is
        $loadOrder += $remaining
        break
    }
    $next = $next | Sort-Object
    foreach ($n in $next) {
        $loadOrder += $n
        $loaded[$n] = $true
        $remaining = $remaining | Where-Object { $_ -ne $n }
    }
    $pass++
}

for ($i = 0; $i -lt $loadOrder.Count; $i++) {
    $num = $i + 1
    Write-Host "  $num. $($loadOrder[$i])" -ForegroundColor Gray
}

# Save load order
$loadOrder | Out-File .\audit\load-order.txt
Write-Host "`nLoad order saved to audit\load-order.txt" -ForegroundColor Green

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Green
Write-Host "Total modules analyzed: $($modules.Count)" -ForegroundColor White
Write-Host "Total functions/variables defined: $(($globalDefs.Keys | Measure-Object).Count)" -ForegroundColor White
Write-Host "CAD module skipped: 04-cad-integration.js (2MB)" -ForegroundColor Yellow
Write-Host "`nNote: Load CAD module after core modules since it's large and has fewer dependencies" -ForegroundColor Yellow
