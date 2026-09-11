<#
  BUILT 2026-09-11 · warrantwire tools/cf.ps1
  ============================================================================
  CLOUDFLARE FROM THE REPO. Pull every worker's live code into workers/, and
  push a worker back up. Bytes are copied, never retyped.

    .\tools\cf.ps1 pull                 every worker -> workers/<name>/worker.js
    .\tools\cf.ps1 pull verdict         one worker
    .\tools\cf.ps1 deploy verdict       workers/verdict/worker.js -> Cloudflare
    .\tools\cf.ps1 bindings verdict     what the live worker is bound to

  NEEDS two environment variables, set once by Mark, never written in a file:
    CF_API_TOKEN    a token from dash.cloudflare.com -> My Profile -> API Tokens
                    -> Create Token -> "Edit Cloudflare Workers" template
    CF_ACCOUNT_ID   from the Workers & Pages overview page, right-hand side

  ⚠ DEPLOY KEEPS THE LIVE BINDINGS. A worker's D1, R2 and secrets are read off
  the running version and sent back with the new code, so a deploy from here
  never strips a binding. Secrets are referenced by name only — their values
  never leave Cloudflare and never reach this machine.

  ⚠ EVERY WORKER SOURCE CARRIES A DEPLOY STAMP FILE beside it,
  workers/<name>/deployed.txt, with the time and the git commit — so the
  question "which build is live" has an answer in the repo.
  ============================================================================
#>
param(
  [Parameter(Position=0)][ValidateSet("pull","deploy","bindings","list")][string]$Cmd = "list",
  [Parameter(Position=1)][string]$Name = ""
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$tok = $env:CF_API_TOKEN; $acct = $env:CF_ACCOUNT_ID
if (-not $tok -or -not $acct) {
  Write-Host "CF_API_TOKEN and CF_ACCOUNT_ID must be set. See the header of this file." -ForegroundColor Yellow
  exit 1
}
$api = "https://api.cloudflare.com/client/v4/accounts/$acct/workers"
$H = @{ Authorization = "Bearer $tok" }

function Get-Workers {
  (Invoke-RestMethod "$api/scripts" -Headers $H).result | Sort-Object id
}

function Pull-One([string]$n) {
  $dir = Join-Path $root "workers\$n"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  # the script content, exactly as it runs; module workers come back as multipart
  $r = Invoke-WebRequest "$api/scripts/$n" -Headers $H -UseBasicParsing
  $body = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
  $ct = [string]$r.Headers["Content-Type"]
  if ($ct -like "multipart/*") {
    # take the first part's body
    $bnd = ($ct -split "boundary=")[1].Trim('"')
    $parts = $body -split [regex]::Escape("--$bnd")
    $part = ($parts | Where-Object { $_ -match "Content-Disposition" } | Select-Object -First 1)
    $i = $part.IndexOf("`r`n`r`n"); if ($i -lt 0) { $i = $part.IndexOf("`n`n"); $sep = 2 } else { $sep = 4 }
    $body = $part.Substring($i + $sep).TrimEnd("`r`n")
  }
  [IO.File]::WriteAllText((Join-Path $dir "worker.js"), $body, (New-Object Text.UTF8Encoding $false))
  # the bindings, by name and type only - never a secret's value
  $b = (Invoke-RestMethod "$api/scripts/$n/bindings" -Headers $H).result
  $b | ForEach-Object {
    $o = [ordered]@{ name = $_.name; type = $_.type }
    if ($_.id) { $o.id = $_.id }; if ($_.bucket_name) { $o.bucket = $_.bucket_name }
    if ($_.namespace_id) { $o.namespace = $_.namespace_id }; if ($_.service) { $o.service = $_.service }
    [pscustomobject]$o
  } | ConvertTo-Json | Set-Content (Join-Path $dir "bindings.json") -Encoding utf8
  "$n  $($body.Length) bytes, $($b.Count) bindings"
}

function Deploy-One([string]$n) {
  $file = Join-Path $root "workers\$n\worker.js"
  if (-not (Test-Path $file)) { throw "no such file: $file" }
  $code = [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8)
  # keep whatever the live worker is bound to; on a FIRST deploy there is
  # nothing live yet, so the bindings come from workers/<name>/bindings.json
  $live = @()
  try { $live = (Invoke-RestMethod "$api/scripts/$n/bindings" -Headers $H).result } catch {}
  # bindings.json can ADD a binding (a new D1 or R2) that is not live yet; a
  # binding that is live is always taken from Cloudflare so a secret's value or
  # a variable's text is never needed here
  $bfile = Join-Path $root "workers\$n\bindings.json"
  if (Test-Path $bfile) {
    $want = Get-Content $bfile -Raw -Encoding utf8 | ConvertFrom-Json
    if ($want -isnot [array]) { $want = @($want) }
    $liveNames = @($live | ForEach-Object { $_.name })
    foreach ($w in $want) {
      if ($liveNames -contains $w.name) { continue }
      if ($w.type -eq "d1" -and $w.id) { $live += [pscustomobject]@{ type="d1"; name=$w.name; id=$w.id } }
      elseif ($w.type -eq "r2_bucket" -and $w.bucket) { $live += [pscustomobject]@{ type="r2_bucket"; name=$w.name; bucket_name=$w.bucket } }
      elseif ($w.type -eq "kv_namespace" -and $w.namespace) { $live += [pscustomobject]@{ type="kv_namespace"; name=$w.name; namespace_id=$w.namespace } }
      elseif ($w.type -eq "send_email") { $live += [pscustomobject]@{ type="send_email"; name=$w.name } }
      # a plain_text variable CAN be added from the file when the file carries its text
      # (a URL, an address - nothing secret); once live, Cloudflare's copy wins
      elseif ($w.type -eq "plain_text" -and $null -ne $w.text) { $live += [pscustomobject]@{ type="plain_text"; name=$w.name; text=[string]$w.text } }
      # secret_text is never added from the file - it carries a value
    }
  }
  $keep = @()
  foreach ($b in $live) {
    switch ($b.type) {
      "d1"            { $keep += @{ type="d1"; name=$b.name; id=$b.id } }
      "r2_bucket"     { $keep += @{ type="r2_bucket"; name=$b.name; bucket_name=$(if ($b.bucket_name) { $b.bucket_name } else { $b.bucket }) } }
      "kv_namespace"  { $keep += @{ type="kv_namespace"; name=$b.name; namespace_id=$b.namespace_id } }
      # secret_text is NOT sent at all - keep_bindings below tells Cloudflare to
      # carry every secret forward; sending one without its value is a 400
      "plain_text"    { $keep += @{ type="plain_text"; name=$b.name; text=$b.text } }
      "service"       { $keep += @{ type="service"; name=$b.name; service=$b.service; environment=$b.environment } }
      "send_email"    { $e = @{ type="send_email"; name=$b.name }; if ($b.destination_address) { $e.destination_address = $b.destination_address }; if ($b.allowed_destination_addresses) { $e.allowed_destination_addresses = $b.allowed_destination_addresses }; $keep += $e }
      "queue"         { $keep += @{ type="queue"; name=$b.name; queue_name=$b.queue_name } }
      "durable_object_namespace" { $keep += @{ type="durable_object_namespace"; name=$b.name; class_name=$b.class_name; script_name=$b.script_name } }
      "analytics_engine" { $keep += @{ type="analytics_engine"; name=$b.name; dataset=$b.dataset } }
      "ai"            { $keep += @{ type="ai"; name=$b.name } }
      "browser"       { $keep += @{ type="browser"; name=$b.name } }
      "secret_text"   { }
      # ⚠ ANYTHING ELSE IS A HARD STOP. A binding type this tool does not know
      # would be silently dropped by the deploy - which is what happened to the
      # wire's EMAIL (send_email) binding on 11 Sep. Refuse rather than drop.
      default         { throw "deploy of $n refused: live binding '$($b.name)' has type '$($b.type)', which this tool does not know how to carry forward. Add it to Deploy-One before deploying." }
    }
  }
  $meta = @{ main_module = "worker.js"; compatibility_date = "2026-09-01"; bindings = $keep;
             keep_bindings = @("secret_text") } | ConvertTo-Json -Depth 5 -Compress
  $bnd = "----ww" + [guid]::NewGuid().ToString("N")
  $nl = "`r`n"
  $sb = New-Object Text.StringBuilder
  [void]$sb.Append("--$bnd$nl" + 'Content-Disposition: form-data; name="metadata"' + $nl + "Content-Type: application/json$nl$nl$meta$nl")
  [void]$sb.Append("--$bnd$nl" + 'Content-Disposition: form-data; name="worker.js"; filename="worker.js"' + $nl + "Content-Type: application/javascript+module$nl$nl$code$nl")
  [void]$sb.Append("--$bnd--$nl")
  $bytes = [Text.Encoding]::UTF8.GetBytes($sb.ToString())
  try {
    $r = Invoke-RestMethod -Method Put "$api/scripts/$n" -Headers $H -ContentType "multipart/form-data; boundary=$bnd" -Body $bytes
  } catch {
    # say WHY, not just 400 - Cloudflare's message names the line of a syntax error
    $s = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
    $e = $s.ReadToEnd(); try { $e = (($e | ConvertFrom-Json).errors | ForEach-Object { "$($_.code): $($_.message)" }) -join "`n" } catch {}
    throw "deploy of $n refused:`n$e"
  }
  if (-not $r.success) { throw ($r.errors | ConvertTo-Json) }
  $git = "C:\Users\realr\AppData\Local\GitHubDesktop\app-3.6.5\resources\app\git\cmd\git.exe"
  $sha = try { (& $git -C $root rev-parse --short HEAD) } catch { "?" }
  "deployed $n at $(Get-Date -Format s) from commit $sha" | Set-Content (Join-Path $root "workers\$n\deployed.txt") -Encoding utf8
  "deployed $n  ($($code.Length) bytes, $($keep.Count) bindings kept)"
}

switch ($Cmd) {
  "list"     { Get-Workers | ForEach-Object { "$($_.id)`t$($_.modified_on)" } }
  "pull"     { if ($Name) { Pull-One $Name } else { Get-Workers | ForEach-Object { Pull-One $_.id } } }
  "deploy"   { if (-not $Name) { throw "deploy which worker?" }; Deploy-One $Name }
  "bindings" { (Invoke-RestMethod "$api/scripts/$Name/bindings" -Headers $H).result | Select-Object name, type, id, bucket_name | Format-Table -AutoSize }
}
