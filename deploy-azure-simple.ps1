# Azure Deployment Script - Simple Version
# This version has minimal verification to avoid false failures

param(
    [string]$AppName = "",
    [string]$ResourceGroup = "",
    [string]$Location = "eastus",
    [string]$GitHubClientId = "",
    [string]$GitHubClientSecret = "",
    [string]$AllowedOrigins = "*",
    [switch]$SkipGitDeploy = $false,
    [switch]$Help = $false
)

# Show help
if ($Help) {
    Write-Host @"
Azure Deployment Script - Simple Version

USAGE:
    .\deploy-azure-simple.ps1 [OPTIONS]

OPTIONS:
    -AppName            Unique name for your Azure App Service (required)
    -ResourceGroup      Resource group name (default: rg-{AppName})
    -Location           Azure region (default: eastus)
    -GitHubClientId     GitHub OAuth App Client ID (required)
    -GitHubClientSecret GitHub OAuth App Client Secret (required)
    -AllowedOrigins     Comma-separated list of allowed CORS origins (default: *)
    -SkipGitDeploy      Skip the Git deployment step
    -Help               Show this help message

"@
    exit 0
}

# Color functions for output
function Write-Success { param([string]$Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Write-Info { param([string]$Message) Write-Host "[INFO] $Message" -ForegroundColor Cyan }
function Write-Warning { param([string]$Message) Write-Host "[WARNING] $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }
function Write-Step { param([string]$Message) Write-Host "`n[STEP] $Message" -ForegroundColor Blue }

Write-Host "Azure Deployment Script - Simple Version" -ForegroundColor Magenta

# Get required parameters if not provided
if (-not $AppName) {
    do {
        $AppName = Read-Host "Enter a unique App Service name (lowercase, no spaces)"
        if ($AppName -match "[^a-z0-9-]") {
            Write-Warning "App name can only contain lowercase letters, numbers, and hyphens"
            $AppName = ""
        }
    } while (-not $AppName)
}

if (-not $ResourceGroup) {
    $ResourceGroup = "rg-$AppName"
}

if (-not $GitHubClientId) {
    do {
        $GitHubClientId = Read-Host "Enter your GitHub OAuth App Client ID"
    } while (-not $GitHubClientId)
}

if (-not $GitHubClientSecret) {
    do {
        $GitHubClientSecret = Read-Host "Enter your GitHub OAuth App Client Secret"
    } while (-not $GitHubClientSecret)
}

Write-Step "Creating Resources"
$planName = "plan-$AppName"

# Create Resource Group
Write-Info "Creating resource group '$ResourceGroup'..."
az group create --name $ResourceGroup --location $Location --output table

# Create App Service Plan
Write-Info "Creating app service plan '$planName'..."
az appservice plan create --name $planName --resource-group $ResourceGroup --sku FREE --is-linux --output table

# Create Web App (try multiple runtime formats)
Write-Info "Creating web app '$AppName'..."
az webapp create --resource-group $ResourceGroup --plan $planName --name $AppName --runtime "PYTHON:3.11" --deployment-local-git --output table
if ($LASTEXITCODE -ne 0) {
    Write-Info "Trying alternative runtime format..."
    az webapp create --resource-group $ResourceGroup --plan $planName --name $AppName --runtime "PYTHON|3.11" --deployment-local-git --output table
}

# Configure Environment Variables
Write-Info "Setting environment variables..."
az webapp config appsettings set --resource-group $ResourceGroup --name $AppName --settings GITHUB_CLIENT_ID="$GitHubClientId" GITHUB_CLIENT_SECRET="$GitHubClientSecret" ALLOWED_ORIGINS="$AllowedOrigins" SCM_DO_BUILD_DURING_DEPLOYMENT=true --output table

# Configure Git Deployment
Write-Info "Setting up Git deployment..."
git remote remove azure 2>$null
$deployUrl = az webapp deployment list-publishing-credentials --resource-group $ResourceGroup --name $AppName --query scmUri -o tsv
git remote add azure $deployUrl

# Deploy Code
if (-not $SkipGitDeploy) {
    Write-Info "Deploying code..."
    git add .
    git commit -m "Deploy to Azure - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" 2>$null
    git push azure main --force
}

$appUrl = "https://$AppName.azurewebsites.net"

Write-Success "Deployment Complete!"
Write-Host @"

App URL: $appUrl
Update your GitHub OAuth callback to: $appUrl/oauth/callback

"@ -ForegroundColor Green
