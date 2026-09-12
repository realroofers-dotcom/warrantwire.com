<#
  BUILT 2026-09-12 · warrantwire tools/serve.ps1
  A static file server for looking at the site locally. Nothing else.
    .\tools\serve.ps1 8765   →  http://localhost:8765/company.html?t=TOVX
  Serves the repo root. Every page calls the live workers, which answer any
  origin, so a local page shows live data.
#>
param([int]$Port = 8765)
$root = Split-Path -Parent $PSScriptRoot
$types = @{ ".html"="text/html; charset=utf-8"; ".css"="text/css"; ".js"="application/javascript";
            ".png"="image/png"; ".jpg"="image/jpeg"; ".svg"="image/svg+xml"; ".json"="application/json"; ".md"="text/plain; charset=utf-8" }
$l = New-Object Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "serving $root on http://localhost:$Port/"
while ($l.IsListening) {
  $c = $l.GetContext()
  $p = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath)
  if ($p -eq "/") { $p = "/index.html" }
  $f = Join-Path $root ($p.TrimStart("/") -replace "/", "\")
  if ((Test-Path $f -PathType Leaf) -and ((Resolve-Path $f).Path.StartsWith($root))) {
    $ext = [IO.Path]::GetExtension($f).ToLower()
    $c.Response.ContentType = if ($types[$ext]) { $types[$ext] } else { "application/octet-stream" }
    $b = [IO.File]::ReadAllBytes($f)
    $c.Response.ContentLength64 = $b.Length
    $c.Response.OutputStream.Write($b, 0, $b.Length)
  } else { $c.Response.StatusCode = 404 }
  $c.Response.Close()
}
