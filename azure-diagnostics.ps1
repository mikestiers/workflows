# Azure Resource Diagnostic Script
# This script helps diagnose what resources exist in your Azure subscription

param(
    [string]$AppName = "github-oauth",
    [string]$ResourceGroup = "rg-github-oauth"
)

Write-Host "Azure Resource Diagnostic for: $AppName" -ForegroundColor Yellow
Write-Host "Resource Group: $ResourceGroup" -ForegroundColor Cyan
Write-Host "=" * 60

# Check if Azure CLI is logged in
try {
    $account = az account show --output json | ConvertFrom-Json
    Write-Host "Logged into Azure as: $($account.user.name)" -ForegroundColor Green
    Write-Host "Subscription: $($account.name) ($($account.id))" -ForegroundColor Green
} catch {
    Write-Host "Not logged into Azure. Run 'az login' first." -ForegroundColor Red
    exit 1
}

Write-Host "`n1. RESOURCE GROUP CHECK" -ForegroundColor Blue
Write-Host "-" * 30

$rgExists = az group exists --name $ResourceGroup --output tsv
Write-Host "Resource Group '$ResourceGroup' exists: $rgExists"

if ($rgExists -eq "true") {
    Write-Host "`nResource Group Details:" -ForegroundColor Cyan
    az group show --name $ResourceGroup --output table
} else {
    Write-Host "Resource group does not exist!" -ForegroundColor Red
}

Write-Host "`n2. APP SERVICE PLANS" -ForegroundColor Blue
Write-Host "-" * 30

Write-Host "All App Service Plans in subscription:" -ForegroundColor Cyan
az appservice plan list --output table

if ($rgExists -eq "true") {
    Write-Host "`nApp Service Plans in resource group '$ResourceGroup':" -ForegroundColor Cyan
    az appservice plan list --resource-group $ResourceGroup --output table
    
    $planName = "plan-$AppName"
    Write-Host "`nChecking specific plan '$planName':" -ForegroundColor Cyan
    $planCheck = az appservice plan show --name $planName --resource-group $ResourceGroup --output table 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Plan '$planName' found!" -ForegroundColor Green
    } else {
        Write-Host "Plan '$planName' NOT found in resource group '$ResourceGroup'" -ForegroundColor Red
        
        # Check if it exists in other resource groups
        Write-Host "`nSearching for plan '$planName' in all resource groups..." -ForegroundColor Yellow
        $allPlans = az appservice plan list --output json | ConvertFrom-Json
        $foundPlan = $allPlans | Where-Object { $_.name -eq $planName }
        
        if ($foundPlan) {
            Write-Host "Found plan '$planName' in resource group: $($foundPlan.resourceGroup)" -ForegroundColor Yellow
            Write-Host "Location: $($foundPlan.location)" -ForegroundColor Yellow
        } else {
            Write-Host "Plan '$planName' not found anywhere in the subscription" -ForegroundColor Red
        }
    }
}

Write-Host "`n3. WEB APPS" -ForegroundColor Blue
Write-Host "-" * 30

Write-Host "All Web Apps in subscription:" -ForegroundColor Cyan
az webapp list --output table

if ($rgExists -eq "true") {
    Write-Host "`nWeb Apps in resource group '$ResourceGroup':" -ForegroundColor Cyan
    az webapp list --resource-group $ResourceGroup --output table
    
    Write-Host "`nChecking specific app '$AppName':" -ForegroundColor Cyan
    $appCheck = az webapp show --name $AppName --resource-group $ResourceGroup --output table 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "App '$AppName' found!" -ForegroundColor Green
    } else {
        Write-Host "App '$AppName' NOT found in resource group '$ResourceGroup'" -ForegroundColor Red
    }
}

Write-Host "`n4. RECOMMENDATIONS" -ForegroundColor Blue
Write-Host "-" * 30

if ($rgExists -ne "true") {
    Write-Host "• Resource group doesn't exist - run deployment script to create it" -ForegroundColor Yellow
} else {
    $planName = "plan-$AppName"
    $planExists = az appservice plan show --name $planName --resource-group $ResourceGroup --output none 2>$null
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "• App Service Plan missing - may need to recreate it" -ForegroundColor Yellow
        Write-Host "• Try running: .\deploy-azure-recovery.ps1 -AppName '$AppName'" -ForegroundColor Cyan
    } else {
        Write-Host "• App Service Plan exists - deployment should work" -ForegroundColor Green
    }
}

Write-Host "`n" + "=" * 60
Write-Host "Diagnostic complete!" -ForegroundColor Green
