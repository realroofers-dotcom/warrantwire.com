@echo off
title Cloudflare token
echo.
echo   Reading the token from your clipboard (what you last copied)...
echo.
powershell -NoProfile -Command "$t = (Get-Clipboard -Raw); if (-not $t) { Write-Host '  Nothing on the clipboard. Copy the token first, then run this again.' -ForegroundColor Yellow; exit }; $t = $t.Trim().Trim([char]34).Trim([char]39); if ($t -match 'Bearer\s+(\S+)') { $t = $matches[1] }; if ($t.Length -lt 20 -or $t -match '\s') { Write-Host ('  The clipboard holds ' + $t.Length + ' characters and it does not look like a token. Copy just the token and run this again.') -ForegroundColor Yellow; exit }; Write-Host ('  Found ' + $t.Length + ' characters, starting ' + $t.Substring(0,5) + ' and ending ' + $t.Substring($t.Length-3)); try { $r = Invoke-RestMethod 'https://api.cloudflare.com/client/v4/user/tokens/verify' -Headers @{ Authorization = ('Bearer ' + $t) }; [Environment]::SetEnvironmentVariable('CF_API_TOKEN',$t,'User'); Write-Host ''; Write-Host ('  CLOUDFLARE ACCEPTS IT (status: ' + $r.result.status + '). SAVED. Close this window and tell Claude done.') -ForegroundColor Green } catch { Write-Host ''; Write-Host '  CLOUDFLARE REJECTED IT. Roll a fresh token (My Profile -> API Tokens -> ... -> Roll -> Copy) and run this again.' -ForegroundColor Red }"
echo.
pause
