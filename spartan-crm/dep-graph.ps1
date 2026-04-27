# dep-graph.ps1 - Create HTML dependency visualization
Write-Host "Generating dependency graph..." -ForegroundColor Green

$modules = Get-ChildItem .\modules\*.js | Sort-Object Name
$html = @"
<!DOCTYPE html>
<html>
<head>
    <title>Module Dependencies</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1400px; margin: auto; background: white; padding: 20px; border-radius: 8px; }
        h1 { color: #c41230; }
        .module { margin-bottom: 20px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
        .module-header { background: #1a1a1a; color: white; padding: 10px 15px; font-weight: bold; cursor: pointer; }
        .module-content { padding: 15px; display: none; }
        .defines { color: #15803d; }
        .uses { color: #c41230; }
        .missing { color: #d97706; font-weight: bold; }
        pre { margin: 0; white-space: pre-wrap; }
        .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin: 2px; }
        .badge-def { background: #dcfce7; color: #15803d; }
        .badge-use { background: #fee2e2; color: #c41230; }
        .badge-missing { background: #fef3c7; color: #d97706; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📦 Module Dependency Analysis</h1>
        <p>Click on any module to see its dependencies</p>
"@

foreach ($mod in $modules) {
    $content = Get-Content $mod.FullName -Raw
    $name = $mod.Name
    
    # Extract defines
    $defines = [regex]::Matches($content, '(?m)^\s*(var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)')
    $funcs = [regex]::Matches($content, '(?m)^\s*function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(')
    
    $defList = @()
    foreach ($d in $defines) { $defList += $d.Groups[2].Value }
    foreach ($f in $funcs) { $defList += $f.Groups[1].Value }
    $defList = $defList | Sort-Object -Unique
    
    $html += @"
        <div class="module">
            <div class="module-header" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'block' ? 'none' : 'block'">
                📄 $name <span style="float:right">▼</span>
            </div>
            <div class="module-content">
                <div><strong>Defines:</strong> $(($defList | ForEach-Object { "<span class='badge badge-def'>$_</span>" }) -join ' ')</div>
                <div style="margin-top:10px"><strong>First 500 chars:</strong></div>
                <pre>$($content.Substring(0, [Math]::Min(500, $content.Length)))</pre>
            </div>
        </div>
"@
}

$html += @"
    </div>
    <script>
        // Auto-expand first module
        document.querySelector('.module-content').style.display = 'block';
    </script>
</body>
</html>
"@

$html | Out-File .\audit\dependencies.html -Encoding UTF8
Write-Host "HTML report saved to audit\dependencies.html" -ForegroundColor Green
Start-Process .\audit\dependencies.html