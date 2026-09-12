<#
  BUILT 2026-09-12 · warrantwire tools/park.ps1
  ============================================================================
  ROUTE THE PARKED DOMAINS TO THE PARK WORKER. Re-runnable: run it again as
  zones turn active and it picks up the new ones.

    .\tools\park.ps1            do it
    .\tools\park.ps1 -WhatIf    say what it would do, touch nothing

  For every name in workers/park/worker.js that has an ACTIVE zone in
  Cloudflare and is not yet routed:
    1. delete the parking records (A / AAAA / CNAME at the apex, www and *)
       ! ONLY IF EVERY ONE OF THEM IS A PARKING RECORD - Sedo's 64.190.63.x,
       sedoparking.com, afternic.com, or nothing at all. A record pointing
       anywhere else means a real site may live there, and the domain is
       SKIPPED and named in the report. Six of the nine names that were
       already active on 12 Sep were live sites: adhotbox, realroofer,
       realroofers, jerseycityroofrepair, newsweed.com, wallstdomains.com.
    2. attach the apex and www to the park worker as custom domains.

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

# every zone, every routed hostname
$zones = @{}; $p = 1
do { $z = Invoke-RestMethod "$api/zones?per_page=50&page=$p" -Headers $H; foreach ($x in $z.result) { $zones[$x.name] = $x }; $p++ } while ($p -le $z.result_info.total_pages)
$routed = @{}; foreach ($d in (Invoke-RestMethod "$api/accounts/$acct/workers/domains" -Headers $H).result) { $routed[$d.hostname] = $d.service }

function IsParking($r) {
  if ($r.type -eq "A" -and $r.content -like "64.190.63.*") { return $true }
  # 192.0.2.x is TEST-NET, a reserved documentation address: a placeholder, never a site
  if ($r.type -eq "A" -and $r.content -like "192.0.2.*") { return $true }
  if ($r.type -eq "CNAME" -and ($r.content -match "sedoparking|afternic|parkingcrew|bodis")) { return $true }
  return $false
}

$done = @(); $skipped = @(); $waiting = @(); $already = @()
foreach ($n in $names) {
  $z = $zones[$n]
  if (-not $z) { $waiting += "$n (no zone yet)"; continue }
  if ($z.status -ne "active") { $waiting += "$n ($($z.status))"; continue }
  if ($routed[$n] -eq "park") { $already += $n; continue }
  if ($routed[$n]) { $skipped += "$n - already routed to worker '$($routed[$n])'"; continue }

  $recs = (Invoke-RestMethod "$api/zones/$($z.id)/dns_records?per_page=100" -Headers $H).result |
          Where-Object { $_.type -in "A","AAAA","CNAME" -and ($_.name -eq $n -or $_.name -eq "www.$n" -or $_.name -eq "*.$n") }
  $foreign = @($recs | Where-Object { -not (IsParking $_) })
  if ($foreign.Count) { $skipped += "$n - has a real record: " + (($foreign | ForEach-Object { "$($_.type) $($_.name)->$($_.content)" }) -join ", "); continue }

  if ($WhatIf) { $done += "$n (would delete $($recs.Count) parking records and attach apex + www)"; continue }
  foreach ($r in $recs) { Invoke-RestMethod -Method Delete "$api/zones/$($z.id)/dns_records/$($r.id)" -Headers $H | Out-Null }
  foreach ($hn in @($n, "www.$n")) {
    $body = @{ hostname = $hn; zone_id = $z.id; service = "park"; environment = "production" } | ConvertTo-Json -Compress
    try { Invoke-RestMethod -Method Put "$api/accounts/$acct/workers/domains" -Headers $H -Body $body | Out-Null }
    catch {
      $why = $_.Exception.Message
      if ($_.Exception.Response) { try { $s = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $why = (($s.ReadToEnd() | ConvertFrom-Json).errors | ForEach-Object { $_.message }) -join "; " } catch {} }
      $skipped += "$hn - attach refused: $why"; Start-Sleep -Milliseconds 800; continue
    }
  }
  $done += $n
  Start-Sleep -Milliseconds 300
}

"ROUTED NOW ($($done.Count)):";    $done    | ForEach-Object { "  $_" }
"ALREADY ROUTED ($($already.Count))"
"SKIPPED - look at these ($($skipped.Count)):"; $skipped | ForEach-Object { "  $_" }
"WAITING on Cloudflare or GoDaddy ($($waiting.Count)):"; $waiting | ForEach-Object { "  $_" }
