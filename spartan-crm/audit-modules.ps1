# audit-modules.ps1 - Analyze module dependencies
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MODULE DEPENDENCY AUDIT" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Get all module files
$modules = Get-ChildItem .\modules\*.js | Sort-Object Name

# Analyze each module
$report = @()
$allDefines = @{}
$allUses = @{}

foreach ($mod in $modules) {
    $content = Get-Content $mod.FullName -Raw
    $name = $mod.Name
    
    Write-Host "Analyzing: $name" -ForegroundColor Yellow
    
    # Find variable/function definitions (var, let, const, function)
    $defines = @()
    
    # var/let/const declarations at top level
    $varMatches = [regex]::Matches($content, '(?m)^\s*(var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)')
    foreach ($m in $varMatches) {
        $defines += $m.Groups[2].Value
    }
    
    # function declarations
    $funcMatches = [regex]::Matches($content, '(?m)^\s*function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(')
    foreach ($m in $funcMatches) {
        $defines += $m.Groups[1].Value
    }
    
    # Find what this module uses (calls or references)
    $uses = @()
    
    # Function calls
    $callMatches = [regex]::Matches($content, '\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(')
    foreach ($m in $callMatches) {
        $call = $m.Groups[1].Value
        # Filter out keywords and common globals
        $keywords = @('if', 'for', 'while', 'switch', 'return', 'typeof', 'console', 'JSON', 'Math', 'Object', 'Array', 'String', 'Number', 'Boolean', 'parseInt', 'parseFloat', 'isNaN', 'undefined', 'null', 'true', 'false', 'this', 'new', 'delete', 'in', 'instanceof', 'void', 'document', 'window', 'localStorage', 'alert', 'confirm', 'setTimeout', 'setInterval', 'clearTimeout', 'addEventListener', 'fetch', 'Promise', 'Date', 'RegExp', 'Error')
        if ($call -notin $keywords -and $call -ne '') {
            $uses += $call
        }
    }
    
    # Variable references (assignments, reads)
    $refMatches = [regex]::Matches($content, '[^a-zA-Z]([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[=,;]')
    foreach ($m in $refMatches) {
        $ref = $m.Groups[1].Value
        $keywords2 = @('var', 'let', 'const', 'function', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'default', 'try', 'catch', 'finally', 'throw', 'new', 'delete', 'typeof', 'instanceof', 'void', 'null', 'undefined', 'true', 'false', 'this', 'arguments', 'eval', 'NaN', 'Infinity', 'document', 'window', 'localStorage', 'console', 'JSON')
        if ($ref -notin $keywords2 -and $ref -ne '') {
            $uses += $ref
        }
    }
    
    $defines = $defines | Sort-Object -Unique
    $uses = $uses | Sort-Object -Unique
    
    $allDefines[$name] = $defines
    $allUses[$name] = $uses
    
    $report += "`n=== $name ==="
    $report += "Defines: $($defines -join ', ')"
    $report += "Uses: $($uses -join ', ')"
    $report += "Defines count: $($defines.Count)"
    $report += "Uses count: $($uses.Count)"
    
    Write-Host "  Defines: $($defines.Count) items" -ForegroundColor Green
    Write-Host "  Uses: $($uses.Count) items" -ForegroundColor Gray
}

# Save full report
$report | Out-File .\audit\module-report.txt
Write-Host "`nFull report saved to audit\module-report.txt" -ForegroundColor Green

# Find unresolved dependencies (uses something not defined in the same module)
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "UNRESOLVED DEPENDENCIES (by module)" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$allDefinedGlobally = @{}
foreach ($mod in $allDefines.Keys) {
    foreach ($def in $allDefines[$mod]) {
        if ($def -ne '') {
            $allDefinedGlobally[$def] = $mod
        }
    }
}

$unresolved = @{}
foreach ($mod in $allUses.Keys) {
    $missing = @()
    foreach ($use in $allUses[$mod]) {
        # Skip if defined in same module
        if ($use -in $allDefines[$mod]) { continue }
        # Skip if defined elsewhere
        if ($use -in $allDefinedGlobally.Keys) { 
            # Defined elsewhere - that's fine
            continue
        }
        # Also skip common React/Vue patterns and DOM elements
        $skipPatterns = @('getElementById', 'querySelector', 'createElement', 'appendChild', 'innerHTML', 'addEventListener', 'removeEventListener', 'preventDefault', 'stopPropagation', 'target', 'currentTarget', 'value', 'checked', 'files', 'src', 'href', 'style', 'classList', 'setAttribute', 'getAttribute', 'focus', 'blur', 'click', 'submit', 'reset', 'scroll', 'offset', 'client')
        if ($use -in $skipPatterns) { continue }
        
        $missing += $use
    }
    if ($missing.Count -gt 0) {
        $unresolved[$mod] = $missing
        Write-Host "$mod depends on: $($missing -join ', ')" -ForegroundColor Yellow
    }
}

# Find circular dependencies
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "MODULE LOAD ORDER SUGGESTION" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Simple topological sort based on definitions
$loadOrder = @()
$loaded = @{}
$remaining = $modules | ForEach-Object { $_.Name } | Sort-Object

# Priority: modules that define core data structures first
$priorityModules = @(
    '01-persistence.js',
    '02-mock-data.js',
    '05-state-auth-rbac.js'
)

foreach ($p in $priorityModules) {
    if ($p -in $remaining) {
        $loadOrder += $p
        $loaded[$p] = $true
        $remaining = $remaining | Where-Object { $_ -ne $p }
    }
}

# Add remaining modules
$loadOrder += $remaining

Write-Host "Suggested load order:" -ForegroundColor Green
for ($i = 0; $i -lt $loadOrder.Count; $i++) {
    Write-Host "  $($i+1). $($loadOrder[$i])" -ForegroundColor Gray
}

# Save load order
$loadOrder | Out-File .\audit\suggested-order.txt
Write-Host "`nSuggested order saved to audit\suggested-order.txt" -ForegroundColor Green

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Green
Write-Host "Total modules: $($modules.Count)" -ForegroundColor White
Write-Host "Total defines: $(($allDefines.Values | ForEach-Object { $_ } | Measure-Object).Count)" -ForegroundColor White
Write-Host "Unresolved external dependencies: $(($unresolved.Values | ForEach-Object { $_ } | Measure-Object).Count)" -ForegroundColor Yellow