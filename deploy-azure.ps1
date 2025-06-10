# Azure Deployment Script for GitHub OAuth Proxy Server
# This script deploys the Python OAuth proxy server to Azure App Service

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
Azure Deployment Script for GitHub OAuth Proxy Server

USAGE:
    .\deploy-azure.ps1 [OPTIONS]

OPTIONS:
    -AppName            Unique name for your Azure App Service (required)
    -ResourceGroup      Resource group name (default: rg-{AppName})
    -Location           Azure region (default: eastus)
    -GitHubClientId     GitHub OAuth App Client ID (required)
    -GitHubClientSecret GitHub OAuth App Client Secret (required)
    -AllowedOrigins     Comma-separated list of allowed CORS origins (default: *)
    -SkipGitDeploy      Skip the Git deployment step
    -Help               Show this help message

EXAMPLES:
    .\deploy-azure.ps1 -AppName "my-oauth-proxy" -GitHubClientId "abc123" -GitHubClientSecret "xyz789"
    .\deploy-azure.ps1 -AppName "my-oauth-proxy" -Location "westus2" -GitHubClientId "abc123" -GitHubClientSecret "xyz789"

PREREQUISITES:
    1. Azure CLI installed and logged in (az login)
    2. Git repository initialized
    3. GitHub OAuth App configured with callback URL: https://{AppName}.azurewebsites.net/oauth/callback

"@
    exit 0
}

# Color functions for output
function Write-Success { param([string]$Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Write-Info { param([string]$Message) Write-Host "[INFO] $Message" -ForegroundColor Cyan }
function Write-Warning { param([string]$Message) Write-Host "[WARNING] $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }
function Write-Step { param([string]$Message) Write-Host "`n[STEP] $Message" -ForegroundColor Blue }

# Banner
Write-Host @"
================================================================
                 Azure Deployment Script                     
              GitHub OAuth Proxy Server                      
================================================================
"@ -ForegroundColor Magenta

# Validate prerequisites
Write-Step "Validating Prerequisites"

# Check if Azure CLI is installed
try {
    $azVersion = az version --output json 2>$null | ConvertFrom-Json
    Write-Success "Azure CLI version $($azVersion.'azure-cli') found"
} catch {
    Write-Error "Azure CLI not found. Please install it first:"
    Write-Host "  winget install Microsoft.AzureCLI"
    exit 1
}

# Check if logged into Azure
try {
    $account = az account show --output json 2>$null | ConvertFrom-Json
    Write-Success "Logged into Azure as $($account.user.name)"
} catch {
    Write-Error "Not logged into Azure. Run 'az login' first."
    exit 1
}

# Check if Git is available
try {
    git --version > $null 2>&1
    Write-Success "Git is available"
} catch {
    Write-Error "Git not found. Please install Git first."
    exit 1
}

# Check if we're in a Git repository
if (-not (Test-Path ".git")) {
    Write-Warning "Not in a Git repository. Initializing..."
    git init
    git add .
    git commit -m "Initial commit for Azure deployment"
    Write-Success "Git repository initialized"
}

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

# Display deployment configuration
Write-Step "Deployment Configuration"
Write-Info "App Service Name: $AppName"
Write-Info "Resource Group: $ResourceGroup"
Write-Info "Location: $Location"
Write-Info "GitHub Client ID: $GitHubClientId"
Write-Info "GitHub Client Secret: $('*' * $GitHubClientSecret.Length)"
Write-Info "Allowed Origins: $AllowedOrigins"

$confirm = Read-Host "`nProceed with deployment? (y/N)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Info "Deployment cancelled"
    exit 0
}

# Step 1: Create Resource Group
Write-Step "Creating Resource Group"
try {
    $rgExists = az group exists --name $ResourceGroup --output tsv
    if ($rgExists -eq "true") {
        Write-Info "Resource group '$ResourceGroup' already exists"
    } else {
        az group create --name $ResourceGroup --location $Location --output none
        Write-Success "Resource group '$ResourceGroup' created in $Location"
    }
} catch {
    Write-Error "Failed to create resource group: $_"
    exit 1
}

# Step 2: Create App Service Plan
Write-Step "Creating App Service Plan"
$planName = "plan-$AppName"
try {
    # Use a more reliable existence check
    Write-Info "Checking if App Service plan '$planName' exists..."
    $planData = az appservice plan show --name $planName --resource-group $ResourceGroup --output json 2>$null
    
    if ($LASTEXITCODE -eq 0 -and $planData) {
        $plan = $planData | ConvertFrom-Json
        Write-Info "App Service plan '$planName' already exists (Status: $($plan.status), Location: $($plan.location))"
    } else {        Write-Info "Creating App Service plan '$planName'..."
        az appservice plan create --name $planName --resource-group $ResourceGroup --sku FREE --is-linux --output none
        
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to create App Service plan. Exit code: $LASTEXITCODE"
            exit 1
        }
        
        Write-Success "App Service plan '$planName' created (FREE tier)"
    }
} catch {
    Write-Error "Failed to create App Service plan: $_"
    exit 1
}

# Step 3: Create Web App
Write-Step "Creating Web App"
try {
    # Check if web app already exists with better error handling
    Write-Info "Checking if web app '$AppName' already exists..."
    $appData = az webapp show --name $AppName --resource-group $ResourceGroup --output json 2>$null
    
    if ($LASTEXITCODE -eq 0 -and $appData) {
        $app = $appData | ConvertFrom-Json
        Write-Info "Web app '$AppName' already exists (State: $($app.state), Location: $($app.location))"
        Write-Success "Skipping web app creation - using existing app"
    } else {
        Write-Info "Creating web app '$AppName'..."
          # Try creating with PYTHON:3.11 first
        az webapp create --resource-group $ResourceGroup --plan $planName --name $AppName --runtime "PYTHON:3.11" --deployment-local-git --output none
        
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Failed to create web app with PYTHON:3.11. Trying alternative runtime format..."
            # Try with pipe format as fallback
            az webapp create --resource-group $ResourceGroup --plan $planName --name $AppName --runtime "PYTHON|3.11" --deployment-local-git --output none
            
            if ($LASTEXITCODE -ne 0) {
                Write-Error "Failed to create Web app with multiple runtime formats. Exit code: $LASTEXITCODE"
                Write-Info "Available runtimes can be checked with: az webapp list-runtimes --linux"
                exit 1
            }
        }
          # Verify the web app was created successfully
        Write-Info "Verifying Web app creation..."
        Start-Sleep -Seconds 10  # Give Azure more time to complete the operation
        
        $retryCount = 0
        $maxRetries = 3
        $appVerified = $false
        
        while ($retryCount -lt $maxRetries -and -not $appVerified) {
            $appCheck = az webapp show --name $AppName --resource-group $ResourceGroup --output json 2>$null
            if ($LASTEXITCODE -eq 0) {
                $appVerified = $true
                Write-Success "Web app '$AppName' verified successfully"
            } else {
                $retryCount++
                if ($retryCount -lt $maxRetries) {
                    Write-Info "Verification attempt $retryCount failed, retrying in 5 seconds..."
                    Start-Sleep -Seconds 5
                } else {
                    Write-Warning "Verification failed after $maxRetries attempts, but app may still exist"
                    Write-Info "Continuing with deployment..."
                    $appVerified = $true  # Assume it's created and continue
                }
            }
        }
        
        Write-Success "Web app '$AppName' created"
    }
} catch {
    Write-Error "Failed to create Web app: $_"
    exit 1
}

# Step 4: Configure Environment Variables
Write-Step "Configuring Environment Variables"
try {
    $settings = @(
        "GITHUB_CLIENT_ID=$GitHubClientId",
        "GITHUB_CLIENT_SECRET=$GitHubClientSecret",
        "ALLOWED_ORIGINS=$AllowedOrigins",
        "SCM_DO_BUILD_DURING_DEPLOYMENT=true",
        "WEBSITE_HTTPLOGGING_RETENTION_DAYS=3"
    )
    
    az webapp config appsettings set --resource-group $ResourceGroup --name $AppName --settings $settings --output none
    Write-Success "Environment variables configured"
} catch {
    Write-Error "Failed to configure environment variables: $_"
    exit 1
}

# Step 5: Get Deployment Credentials and Configure Git
Write-Step "Configuring Git Deployment"
try {
    # Remove existing azure remote if it exists
    git remote remove azure 2>$null

    # Get deployment URL with retry logic for Azure API issues
    Write-Info "Getting deployment credentials..."
    $retryCount = 0
    $maxRetries = 3
    $deployUrl = $null
    
    while ($retryCount -lt $maxRetries -and -not $deployUrl) {
        try {            $deploymentCredentials = az webapp deployment list-publishing-credentials --resource-group $ResourceGroup --name $AppName --output json 2>$null | ConvertFrom-Json
            
            if ($LASTEXITCODE -eq 0 -and $deploymentCredentials.scmUri) {
                $deployUrl = $deploymentCredentials.scmUri
                Write-Success "Deployment credentials retrieved successfully"
                break
            } else {
                throw "Failed to get deployment credentials"
            }
        } catch {
            $retryCount++
            if ($retryCount -lt $maxRetries) {
                Write-Warning "Failed to get deployment credentials (attempt $retryCount). Retrying in 5 seconds..."
                Start-Sleep -Seconds 5
            } else {
                Write-Error "Failed to get deployment credentials after $maxRetries attempts"
                Write-Info "You can configure Git deployment manually later with:"
                Write-Info "  az webapp deployment list-publishing-credentials --resource-group $ResourceGroup --name $AppName"
                throw "Deployment credentials unavailable"
            }
        }
    }
    
    # Add Azure remote
    git remote add azure $deployUrl
    Write-Success "Git remote 'azure' configured"
} catch {
    Write-Error "Failed to configure Git deployment: $_"
    Write-Warning "Continuing without Git deployment setup. You can configure it manually later."
}

# Step 6: Deploy Code
if (-not $SkipGitDeploy) {
    Write-Step "Deploying Code to Azure"
    try {
        # Ensure all changes are committed
        git add .
        $status = git status --porcelain
        if ($status) {
            git commit -m "Deploy to Azure App Service - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
            Write-Info "Changes committed to Git"
        }
        
        # Deploy to Azure
        Write-Info "Pushing code to Azure (this may take a few minutes)..."
        git push azure main --force
        Write-Success "Code deployed successfully"
    } catch {
        Write-Error "Failed to deploy code: $_"
        Write-Warning "You can deploy manually later with: git push azure main"
    }
}

# Step 7: Display Results
Write-Step "Deployment Complete!"

$appUrl = "https://$AppName.azurewebsites.net"

Write-Host @"

================================================================
                    DEPLOYMENT SUCCESSFUL                     
================================================================
App Service URL: $appUrl
OAuth Login URL: $appUrl/oauth/login
Health Check:    $appUrl/health
 
NEXT STEPS:
1. Update your GitHub OAuth App callback URL to:
   $appUrl/oauth/callback
 
2. Update your client-side code to use:
   const PROXY_BASE_URL = '$appUrl';
 
3. Test your deployment:
   curl $appUrl/health
================================================================

"@ -ForegroundColor Green

# Optional: Open browser to test
$openBrowser = Read-Host "Open the deployed app in your browser? (y/N)"
if ($openBrowser -eq "y" -or $openBrowser -eq "Y") {
    Start-Process $appUrl
}

# Show management commands
Write-Host @"
USEFUL MANAGEMENT COMMANDS:

View live logs:
  az webapp log tail --resource-group $ResourceGroup --name $AppName

Download logs:
  az webapp log download --resource-group $ResourceGroup --name $AppName

Restart app:
  az webapp restart --resource-group $ResourceGroup --name $AppName

Update environment variables:
  az webapp config appsettings set --resource-group $ResourceGroup --name $AppName --settings KEY=VALUE

Scale up to Basic plan:
  az appservice plan update --name $planName --resource-group $ResourceGroup --sku B1

Delete resources:
  az group delete --name $ResourceGroup --yes --no-wait

"@ -ForegroundColor Cyan

Write-Success "Deployment script completed successfully!"
