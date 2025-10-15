# Test Member Registration Endpoint

$headers = @{
    "Content-Type" = "application/json"
}

$body = @{
    email = "test.member@example.com"
    firstName = "John"
    lastName = "Doe"
    phone = "5125551234"
    dateOfBirth = "01151990"
    gender = "M"
    ssn = "123456789"
    address = "123 Test Street"
    city = "Austin"
    state = "TX"
    zipCode = "78701"
    employerName = "Test Company"
    memberType = "member-only"
    termsAccepted = $true
    privacyAccepted = $true
} | ConvertTo-Json

try {
    Write-Host "Testing member registration endpoint..." -ForegroundColor Cyan
    Write-Host "URL: http://localhost:5000/api/registration" -ForegroundColor Yellow
    Write-Host ""
    
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/registration" -Method Post -Headers $headers -Body $body
    
    Write-Host "✅ SUCCESS!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 10
    
} catch {
    Write-Host "❌ ERROR!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Status Code:" $_.Exception.Response.StatusCode.value__ -ForegroundColor Red
    Write-Host "Error Message:" $_.Exception.Message -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host ""
        Write-Host "Response Body:" -ForegroundColor Yellow
        $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json -Depth 10
    }
}
