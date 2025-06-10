# Azure Deployment Recovery Script
# Use this when you get "resource not found" errors during deployment

param(
    [Parameter(Mandatory=$true)]
    [string]$AppName,
    
    [string]$ResourceGroup = "rg-$AppName",
    [string]$Location = "eastus"
)

Write-Host "Azure Deployment Recovery for: $AppName" -ForegroundColor Yellow
Write-Host "Resource Group: $ResourceGroup" -ForegroundColor Cyan
Write-Host "Location: $Location" -ForegroundColor Cyan

$planName = "plan-$AppName"

# Check and clean up existing resources
Write-Host "`nChecking existing resources..." -ForegroundColor Blue

# Check Resource Group
$rgExists = az group exists --name $ResourceGroup --output tsv 2>$null
Write-Host "Resource Group '$ResourceGroup' exists: $rgExists" -ForegroundColor Cyan

# Check App Service Plan
$planExists = az appservice plan show --name $planName --resource-group $ResourceGroup --output none 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "App Service Plan '$planName' exists: TRUE" -ForegroundColor Green
} else {
    Write-Host "App Service Plan '$planName' exists: FALSE" -ForegroundColor Red
}

# Check Web App
$appExists = az webapp show --name $AppName --resource-group $ResourceGroup --output none 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Web App '$AppName' exists: TRUE" -ForegroundColor Green
} else {
    Write-Host "Web App '$AppName' exists: FALSE" -ForegroundColor Red
}

Write-Host "`nRecovery Options:" -ForegroundColor Yellow
Write-Host "1. Delete all resources and start fresh"
Write-Host "2. Try to recreate missing resources only"
Write-Host "3. Exit and investigate manually"

$choice = Read-Host "`nEnter your choice (1-3)"

switch ($choice) {
    "1" {
        Write-Host "`nDeleting all resources..." -ForegroundColor Red
        if ($rgExists -eq "true") {
            Write-Host "Deleting resource group '$ResourceGroup'..."
            az group delete --name $ResourceGroup --yes --no-wait
            Write-Host "Resource group deletion initiated (running in background)" -ForegroundColor Green
            Write-Host "Wait a few minutes, then run the main deployment script again." -ForegroundColor Yellow
        } else {
            Write-Host "Resource group doesn't exist, nothing to delete." -ForegroundColor Green
        }
    }
    
    "2" {
        Write-Host "`nAttempting to recreate missing resources..." -ForegroundColor Blue
        
        # Ensure Resource Group exists
        if ($rgExists -ne "true") {
            Write-Host "Creating resource group..."
            az group create --name $ResourceGroup --location $Location --output none
            if ($LASTEXITCODE -eq 0) {
                Write-Host "Resource group created successfully" -ForegroundColor Green
            } else {
                Write-Host "Failed to create resource group" -ForegroundColor Red
                exit 1
            }
        }
        
        # Recreate App Service Plan if missing
        $planCheck = az appservice plan show --name $planName --resource-group $ResourceGroup --output none 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Creating App Service Plan..."
            az appservice plan create --name $planName --resource-group $ResourceGroup --sku FREE --is-linux --output none
            if ($LASTEXITCODE -eq 0) {
                Write-Host "App Service Plan created successfully" -ForegroundColor Green
            } else {
                Write-Host "Failed to create App Service Plan" -ForegroundColor Red
                exit 1
            }
        }
        
        Write-Host "Recovery completed. You can now run the main deployment script again." -ForegroundColor Green
    }
    
    "3" {
        Write-Host "Exiting. You can investigate the issues manually using Azure Portal or CLI." -ForegroundColor Yellow
        Write-Host "Useful commands:"
        Write-Host "  az group show --name $ResourceGroup"
        Write-Host "  az appservice plan list --resource-group $ResourceGroup"
        Write-Host "  az webapp list --resource-group $ResourceGroup"
    }
    
    default {
        Write-Host "Invalid choice. Exiting." -ForegroundColor Red
    }
}
