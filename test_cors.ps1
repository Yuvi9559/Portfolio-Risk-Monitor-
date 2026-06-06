$r = Invoke-WebRequest -Uri 'https://frontend-production-f2260.up.railway.app' -Method HEAD -UseBasicParsing
Write-Host "=== Frontend Response Headers ==="
foreach ($h in $r.Headers.GetEnumerator()) {
    Write-Host "$($h.Key): $($h.Value)"
}

Write-Host ""
Write-Host "=== Backend POST test with real-looking body ==="
try {
    $body = '{"id_token":"eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.fake.token"}'
    $headers = @{
        'Content-Type' = 'application/json'
        'Origin' = 'https://frontend-production-f2260.up.railway.app'
    }
    $r2 = Invoke-WebRequest -Uri 'https://portfolio-risk-monitor-production.up.railway.app/auth/google' -Method POST -Body $body -Headers $headers -UseBasicParsing -ErrorAction Stop
    Write-Host "Status: $($r2.StatusCode)"
    Write-Host "Body: $($r2.Content)"
    foreach ($h in $r2.Headers.GetEnumerator()) {
        Write-Host "$($h.Key): $($h.Value)"
    }
} catch {
    Write-Host "POST Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        Write-Host "HTTP Status: $($_.Exception.Response.StatusCode.value__)"
        Write-Host "Response Headers:"
        foreach ($header in $_.Exception.Response.Headers) {
            Write-Host "  $header : $($_.Exception.Response.Headers[$header])"
        }
    }
}
