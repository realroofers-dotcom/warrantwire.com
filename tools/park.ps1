<#
  BUILT 2026-09-20 · warrantwire tools/park.ps1 · park 2
  ============================================================================
  EVERY NAME FOR SALE GOES TO WALL ST DOMAINS. Re-runnable: run it again any
  time and it finishes whatever is not done.

    .\tools\park.ps1            do it
    .\tools\park.ps1 -WhatIf    say what it would do, touch nothing

  ⚠ WHAT WAS WRONG, 20 Sep 2026 — his find: atomwatt.com "does not go to
  wallstdomains". It did, at the apex; www.atomwatt.com did not exist, and
  95 of the 144 names had never been added to Cloudflare at all, so they sat
  at GoDaddy pointing nowhere. Park 1 waited for a zone to be ACTIVE and
  attached custom domains; it never created a zone and it left www behind
  on most names. Park 2 does not wait for anything:

  For every name in workers/park/worker.js:
    1. NO ZONE  → create one in Cloudflare (it comes back PENDING with a
       nameserver pair; GoDaddy is told at the end).
    2. RECORDS  → the apex and www each get A 192.0.2.1, proxied, unless a
       REAL record is there. 192.0.2.x is TEST-NET, a placeholder never a
       site; the AAAA 100:: that Cloudflare writes for a custom domain is a
       placeholder too. Any other A/AAAA/CNAME means a live site may be
       there: the name is SKIPPED and named in the report. (adhotbox,
       realroofer, realroofers, jerseycityroofrepair, newsweed.com,
       wallstdomains.com are live sites and stay that way.)
    3. ROUTE    → *<name>/* → park. A route works on a pending zone, so the
       name redirects the moment the nameservers flip. A custom domain
       already attached at the apex keeps working beside it.
    4. At the end: every zone that is still PENDING, with the pair GoDaddy
       needs. Select them all in the GoDaddy portfolio and set it once.

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

# the names, from the worker itself
$names = @(); Select-String -Path (Join-Path $root "workers\park\worker.js") -Pattern '^\s*"([^"]+)":\s*"[^"]+"' | ForEach-Object { if ($_.Matches[0].Groups[1].Value -match '\.') { $names += $_.Matches[0].Groups[1].Value } }

$zones = @{}; $p = 1
do { $z = Invoke-RestMethod "$api/zones?per_page=50&page=$p" -Headers $H; foreach ($x in $z.result) { $zones[$x.name] = $x }; $p++ } while ($p -le $z.result_info.total_pages)

function Why($e) { $why = $e.Exception.Message; if ($e.Exception.Response) { try { $s = New-Object IO.StreamReader($e.Exception.Response.GetResponseStream()); $why = (($s.ReadToEnd() | ConvertFrom-Json).errors | ForEach-Object { $_.message }) -join "; " } catch {} }; $why }
function IsPlaceholder($r) {
  if ($r.type -eq "A"    -and $r.content -like "192.0.2.*") { return $true }
  if ($r.type -eq "A"    -and $r.content -like "64.190.63.*") { return $true }   # Sedo parking, never a site
  if ($r.type -eq "AAAA" -and $r.content -eq "100::") { return $true }
  if ($r.type -eq "CNAME" -and ($r.content -match "sedoparking|afternic|parkingcrew|bodis")) { return $true }
  return $false
}

$created = @(); $done = @(); $already = @(); $skipped = @(); $failed = @()
foreach ($n in $names) {
  $z = $zones[$n]
  # 1. the zone
  if (-not $z) {
    if ($WhatIf) { $created += "$n (would create)"; continue }
    try {
      $body = @{ name = $n; account = @{ id = $acct }; type = "full" } | ConvertTo-Json -Compress
      $z = (Invoke-RestMethod -Method Post "$api/zones" -Headers $H -Body $body).result
      $zones[$n] = $z; $created += "$n -> $($z.name_servers -join ' / ')"
      Start-Sleep -Milliseconds 400
    } catch { $failed += "$n - zone: $(Why $_)"; continue }
  }
  $zid = $z.id
  # 2. the records
  try {
    $recs = (Invoke-RestMethod "$api/zones/$zid/dns_records?per_page=100" -Headers $H).result |
            Where-Object { $_.type -in "A","AAAA","CNAME" -and ($_.name -eq $n -or $_.name -eq "www.$n" -or $_.name -eq "*.$n") }
  } catch { $failed += "$n - records: $(Why $_)"; continue }
  $foreign = @($recs | Where-Object { -not (IsPlaceholder $_) })
  if ($foreign.Count) { $skipped += "$n - has a real record: " + (($foreign | ForEach-Object { "$($_.type) $($_.name)->$($_.content)" }) -join ", "); continue }
  $need = @(); foreach ($hn in @($n, "www.$n")) { if (-not ($recs | Where-Object { $_.name -eq $hn })) { $need += $hn } }
  # 3. the route
  $routes = @(); try { $routes = (Invoke-RestMethod "$api/zones/$zid/workers/routes" -Headers $H).result } catch {}
  $have = $routes | Where-Object { $_.pattern -eq "*$n/*" }
  $needRoute = (-not $have) -or ($have.script -ne "park")
  if (-not $need.Count -and -not $needRoute) { $already += $n; continue }
  if ($WhatIf) { $done += "$n ($($z.status)) - would add [$($need -join ', ')]" + $(if ($needRoute) { " and route" }); continue }
  try {
    foreach ($hn in $need) {
      $body = @{ type = "A"; name = $hn; content = "192.0.2.1"; proxied = $true; ttl = 1; comment = "placeholder: for sale, sent to wallstdomains.com by the park worker" } | ConvertTo-Json -Compress
      Invoke-RestMethod -Method Post "$api/zones/$zid/dns_records" -Headers $H -Body $body | Out-Null
    }
    if ($needRoute) {
      $body = @{ pattern = "*$n/*"; script = "park" } | ConvertTo-Json -Compress
      if ($have) { Invoke-RestMethod -Method Put "$api/zones/$zid/workers/routes/$($have.id)" -Headers $H -Body $body | Out-Null }
      else { Invoke-RestMethod -Method Post "$api/zones/$zid/workers/routes" -Headers $H -Body $body | Out-Null }
    }
    $done += "$n ($($z.status)) + [$($need -join ', ')]" + $(if ($needRoute) { " + route" })
  } catch { $failed += "$n - $(Why $_)" }
  Start-Sleep -Milliseconds 250
}

"ZONES CREATED ($($created.Count)):";  $created | ForEach-Object { "  $_" }
"WIRED NOW ($($done.Count)):";         $done    | ForEach-Object { "  $_" }
"ALREADY WIRED ($($already.Count))"
"SKIPPED - live sites, left alone ($($skipped.Count)):"; $skipped | ForEach-Object { "  $_" }
"FAILED ($($failed.Count)):";          $failed  | ForEach-Object { "  $_" }
""
"GODADDY - these zones are PENDING until their nameservers are set. Group by pair:"
$byPair = @{}
foreach ($n in $names) { $z = $zones[$n]; if ($z -and $z.status -ne "active") { $k = ($z.name_servers | Sort-Object) -join " / "; if (-not $byPair[$k]) { $byPair[$k] = @() }; $byPair[$k] += $n } }
foreach ($k in $byPair.Keys) { ""; "  $k  ($($byPair[$k].Count) names):"; $byPair[$k] | Sort-Object | ForEach-Object { "    $_" } }
