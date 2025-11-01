# Test Lead Form Submission
# This tests that the public lead form can submit without authentication

Write-Host "Testing Lead Form Submission..." -ForegroundColor Cyan

# Test data
$leadData = @{
    firstName = "Test"
    lastName = "Lead"
    email = "testlead@example.com"
    phone = "555-0123"
    message = "Testing lead form submission - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
} | ConvertTo-Json

# Get the API URL from environment or use localhost
$apiUrl = if ($env:RAILWAY_STATIC_URL) { 
    "https://$env:RAILWAY_STATIC_URL" 
} else { 
    "http://localhost:5000" 
}

Write-Host "API URL: $apiUrl" -ForegroundColor Yellow
Write-Host "Submitting lead: Test Lead <testlead@example.com>" -ForegroundColor Yellow

try {
    # Submit the lead (no authentication needed)
    $response = Invoke-RestMethod -Uri "$apiUrl/api/public/leads" `
        -Method Post `
        -Body $leadData `
        -ContentType "application/json" `
        -ErrorAction Stop
    
    Write-Host "✅ Lead submitted successfully!" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 3
    
    Write-Host "`n✅ Lead form is working correctly!" -ForegroundColor Green
    Write-Host "The public can now submit leads without authentication." -ForegroundColor Green
    
} catch {
    Write-Host "❌ Lead submission failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    
    Write-Host "`nTroubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Make sure the server is running" -ForegroundColor Yellow
    Write-Host "2. Run the RLS migration: migrations/allow-public-lead-submission.sql" -ForegroundColor Yellow
    Write-Host "3. Check that leads table exists in Supabase" -ForegroundColor Yellow
}
