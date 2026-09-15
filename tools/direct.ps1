<#
  BUILT 2026-09-15 · warrantwire tools/direct.ps1
  ============================================================================
  ROUTE THE DIRECTIONAL DOMAINS TO THE DIRECT WORKER. Re-runnable: run it
  again after adding a name to workers/direct/worker.js and it picks it up.

    .\tools\direct.ps1            do it
    .\tools\direct.ps1 -WhatIf    say what it would do, touch nothing

  For every name in the DOORS table of workers/direct/worker.js that has a
  zone in Cloudflare (ACTIVE OR PENDING — unlike park.ps1 this does not wait,
  because a route and a placeholder record can be set before the nameservers
  flip, so the door works the moment they do):
    1. make sure the apex and www each carry A 192.0.2.1, proxied. 192.0.2.x
       is TEST-NET, a reserved documentation address: a placeholder, never a
       site. Any OTHER A / AAAA / CNAME at the apex, www or * is left alone
       and the domain is SKIPPED and named — a real site may live there.
    2. make sure the route  *<name>/*  -> direct  exists.

  Needs CF_API_TOKEN and CF_ACCOUNT_ID, same as cf.ps1.
  ============================================================================
#>
param([switch]$WhatIf)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$tok = $env:CF_API_TOKEN; $acct = $env:CF_ACCOUNT_ID
if (-not $tok -or -not $acct) { Write-Host "CF_API_TOKEN and CF_ACCOUNT_ID must be set." -ForegroundColor Yellow; exit 1 }
$H = @{ Authorization = "Bearer $tok"; "Content-Type" = "application/json" }
$api = "https://api.cloudflare.com/client/v4"

# the names, from the worker itself: the keys of DOORS
$names = @(); Select-String -Path (Join-Path $root "workers\direct\worker.js") -Pattern '^\s*"([^"]+\.[^"]+)":\s*\{' | ForEach-Object { $names += $_.Matches[0].Groups[1].Value }

$zones = @{}; $p = 1
do { $z = Invoke-RestMethod "$api/zones?per_page=50&page=$p" -Headers $H; foreach ($x in $z.result) { $zones[$x.name] = $x }; $p++ } while ($p -le $z.result_info.total_pages)

function Why($e) { $why = $e.Exception.Message; if ($e.Exception.Response) { try { $s = New-Object IO.StreamReader($e.Exception.Response.GetResponseStream()); $why = (($s.ReadToEnd() | ConvertFrom-Json).errors | ForEach-Object { $_.message }) -join "; " } catch {} }; $why }

$done = @(); $skipped = @(); $waiting = @(); $already = @()
foreach ($n in $names) {
  $z = $zones[$n]
  if (-not $z) { $waiting += "$n (no zone yet - add it in Cloudflare first)"; continue }
  $zid = $z.id
  $recs = (Invoke-RestMethod "$api/zones/$zid/dns_records?per_page=100" -Headers $H).result |
          Where-Object { $_.type -in "A","AAAA","CNAME" -and ($_.name -eq $n -or $_.name -eq "www.$n" -or $_.name -eq "*.$n") }
  $foreign = @($recs | Where-Object { -not ($_.type -eq "A" -and $_.content -like "192.0.2.*") })
  if ($foreign.Count) { $skipped += "$n - has a real record: " + (($foreign | ForEach-Object { "$($_.type) $($_.name)->$($_.content)" }) -join ", "); continue }

  $routes = (Invoke-RestMethod "$api/zones/$zid/workers/routes" -Headers $H).result
  $have = $routes | Where-Object { $_.pattern -eq "*$n/*" }
  $needRec = @(); foreach ($hn in @($n, "www.$n")) { if (-not ($recs | Where-Object { $_.name -eq $hn })) { $needRec += $hn } }
  $needRoute = -not $have -or $have.script -ne "direct"

  if (-not $needRec.Count -and -not $needRoute) { $already += "$n ($($z.status))"; continue }
  if ($WhatIf) { $done += "$n ($($z.status)) - would add records [$($needRec -join ', ')]" + $(if ($needRoute) { " and route *$n/* -> direct" }); continue }

  try {
    foreach ($hn in $needRec) {
      $body = @{ type = "A"; name = $hn; content = "192.0.2.1"; proxied = $true; ttl = 1; comment = "placeholder: door to warrantwire via the direct worker" } | ConvertTo-Json -Compress
      Invoke-RestMethod -Method Post "$api/zones/$zid/dns_records" -Headers $H -Body $body | Out-Null
    }
    if ($needRoute) {
      if ($have) {
        $body = @{ pattern = "*$n/*"; script = "direct" } | ConvertTo-Json -Compress
        Invoke-RestMethod -Method Put "$api/zones/$zid/workers/routes/$($have.id)" -Headers $H -Body $body | Out-Null
      } else {
        $body = @{ pattern = "*$n/*"; script = "direct" } | ConvertTo-Json -Compress
        Invoke-RestMethod -Method Post "$api/zones/$zid/workers/routes" -Headers $H -Body $body | Out-Null
      }
    }
    $done += "$n ($($z.status))"
  } catch { $skipped += "$n - refused: $(Why $_)" }
  Start-Sleep -Milliseconds 300
}

"ROUTED NOW ($($done.Count)):";    $done    | ForEach-Object { "  $_" }
"ALREADY ROUTED ($($already.Count)):"; $already | ForEach-Object { "  $_" }
"SKIPPED - look at these ($($skipped.Count)):"; $skipped | ForEach-Object { "  $_" }
"WAITING ($($waiting.Count)):"; $waiting | ForEach-Object { "  $_" }
""
"PENDING zones need their nameservers changed at GoDaddy before the door opens:"
foreach ($n in $names) { $z = $zones[$n]; if ($z -and $z.status -ne "active") { "  $n -> $($z.name_servers -join '  /  ')" } }
