# Quick Azure Deployment Script
# Simplified version for fast deployment

param(
    [Parameter(Mandatory=$true)]
    [string]$AppName,
    
    [Parameter(Mandatory=$true)]
    [string]$GitHubClientId,
    
    [Parameter(Mandatory=$true)]
    [string]$GitHubClientSecret
)

Write-Host "Deploying $AppName to Azure..." -ForegroundColor Green

# Set defaults
$ResourceGroup = "rg-$AppName"
$Location = "eastus"
$PlanName = "plan-$AppName"

# Create resources
Write-Host "Creating resource group..." -ForegroundColor Yellow
az group create --name $ResourceGroup --location $Location --output none
if ($LASTEXITCODE -ne 0) { Write-Host "Failed to create resource group" -ForegroundColor Red; exit 1 }

Write-Host "Creating app service plan..." -ForegroundColor Yellow
az appservice plan create --name $PlanName --resource-group $ResourceGroup --sku FREE --is-linux --output none
if ($LASTEXITCODE -ne 0) { Write-Host "Failed to create app service plan" -ForegroundColor Red; exit 1 }

Write-Host "Creating web app..." -ForegroundColor Yellow
az webapp create --resource-group $ResourceGroup --plan $PlanName --name $AppName --runtime "PYTHON:3.11" --deployment-local-git --output none
if ($LASTEXITCODE -ne 0) { 
    Write-Host "Trying alternative runtime format..." -ForegroundColor Yellow
    az webapp create --resource-group $ResourceGroup --plan $PlanName --name $AppName --runtime "PYTHON|3.11" --deployment-local-git --output none
    if ($LASTEXITCODE -ne 0) { Write-Host "Failed to create web app" -ForegroundColor Red; exit 1 }
}

Write-Host "Setting environment variables..." -ForegroundColor Yellow
az webapp config appsettings set --resource-group $ResourceGroup --name $AppName --settings GITHUB_CLIENT_ID="$GitHubClientId" GITHUB_CLIENT_SECRET="$GitHubClientSecret" SCM_DO_BUILD_DURING_DEPLOYMENT=true --output none

Write-Host "Configuring git deployment..." -ForegroundColor Yellow
$deployUrl = az webapp deployment list-publishing-credentials --resource-group $ResourceGroup --name $AppName --query scmUri -o tsv
git remote remove azure 2>$null
git remote add azure $deployUrl

Write-Host "Deploying code..." -ForegroundColor Yellow
git add .
git commit -m "Deploy to Azure" 2>$null
git push azure main --force

Write-Host @"

DEPLOYMENT COMPLETE!

App URL: https://$AppName.azurewebsites.net
Update your GitHub OAuth callback to: https://$AppName.azurewebsites.net/oauth/callback

"@ -ForegroundColor Green
