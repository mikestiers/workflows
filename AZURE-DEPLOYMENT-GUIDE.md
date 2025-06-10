# Azure App Service Deployment Guide

## Overview
This guide walks you through deploying your GitHub OAuth proxy server to Azure App Service. Azure App Service is Microsoft's cloud platform for hosting web applications with built-in scaling, security, and DevOps integration.

## Prerequisites
- Azure account (free tier available)
- Azure CLI installed
- GitHub OAuth App configured
- Python OAuth proxy server working locally

## Benefits of Azure App Service
- ✅ **Free Tier Available** - Perfect for development and testing
- ✅ **Easy Scaling** - Scale up or out as needed
- ✅ **Built-in SSL** - HTTPS enabled automatically
- ✅ **Multiple Deployment Options** - Git, GitHub Actions, Visual Studio, etc.
- ✅ **Environment Variables** - Secure configuration management
- ✅ **Monitoring & Logging** - Built-in application insights

## Step 1: Install Azure CLI

### Windows (Recommended methods):
```powershell
# Using winget (Windows Package Manager)
winget install Microsoft.AzureCLI

# Or using Chocolatey
choco install azure-cli

# Or download installer from:
# https://docs.microsoft.com/en-us/cli/azure/install-azure-cli-windows
```

### Verify Installation:
```powershell
az --version
```

## Step 2: Login to Azure

```powershell
az login
```

This will open your browser for authentication.

## Step 3: Deploy Using Automated Script

### Quick Deployment (Recommended):
```powershell
# Run the automated deployment script
.\deploy-azure.bat
```

The script will prompt you for:
- **App Service Name** - Choose a unique name (e.g., `mike-github-oauth-2024`)
- **Resource Group** - Will create `rg-{your-app-name}` if not specified
- **Region** - Will use `East US` if not specified
- **GitHub Client ID** - Your OAuth app client ID
- **GitHub Client Secret** - Your OAuth app client secret

## Step 4: Manual Deployment (Alternative)

If you prefer to deploy manually:

### 4.1 Create Resource Group:
```powershell
az group create --name "rg-github-oauth" --location "eastus"
```

### 4.2 Create App Service Plan:
```powershell
az appservice plan create --name "plan-github-oauth" --resource-group "rg-github-oauth" --sku FREE --is-linux
```

### 4.3 Create Web App:
```powershell
az webapp create --resource-group "rg-github-oauth" --plan "plan-github-oauth" --name "your-unique-app-name" --runtime "PYTHON|3.11" --deployment-local-git
```

### 4.4 Set Environment Variables:
```powershell
az webapp config appsettings set --resource-group "rg-github-oauth" --name "your-app-name" --settings GITHUB_CLIENT_ID="your_client_id" GITHUB_CLIENT_SECRET="your_client_secret" SCM_DO_BUILD_DURING_DEPLOYMENT=true
```

### 4.5 Configure Git Deployment:
```powershell
az webapp deployment source config-local-git --resource-group "rg-github-oauth" --name "your-app-name"
```

### 4.6 Deploy Code:
```powershell
# Get deployment URL
$deployUrl = az webapp deployment list-publishing-credentials --resource-group "rg-github-oauth" --name "your-app-name" --query scmUri -o tsv

# Add Azure remote
git remote add azure $deployUrl

# Deploy
git add .
git commit -m "Deploy to Azure App Service"
git push azure main
```

## Step 5: Configure Your GitHub OAuth App

1. **Go to GitHub OAuth App Settings**:
   - GitHub → Settings → Developer settings → OAuth Apps → Your App

2. **Update Authorization callback URL**:
   - Change from: `http://localhost:8000/oauth/callback`
   - Change to: `https://your-app-name.azurewebsites.net/oauth/callback`

3. **Update Homepage URL** (optional):
   - Set to your GitHub Pages URL or Azure app URL

## Step 6: Update Your HTML Client

Update your production HTML file to use the Azure URL:

```javascript
// In github-workflow-production.html, change:
const PROXY_BASE_URL = 'https://your-app-name.azurewebsites.net';
```

## Step 7: Deploy HTML to GitHub Pages

1. **Update your production HTML file with the correct Azure URL**
2. **Copy to your docs folder as index.html**:
   ```powershell
   Copy-Item docs\github-workflow-production.html docs\index.html
   ```
3. **Enable GitHub Pages** in your repository settings
4. **Commit and push your changes**

## Step 8: Test Your Deployment

### Test the Azure API:
```powershell
# Check health endpoint
curl https://your-app-name.azurewebsites.net/health

# Check OAuth authorize endpoint (should redirect to GitHub)
curl https://your-app-name.azurewebsites.net/oauth/authorize
```

### Test the full flow:
1. Visit your GitHub Pages URL
2. Click "Authenticate with GitHub"
3. Complete OAuth flow
4. Try triggering a workflow

## Monitoring and Debugging

### View Logs:
```powershell
# Stream live logs
az webapp log tail --resource-group "rg-github-oauth" --name "your-app-name"

# Download log files
az webapp log download --resource-group "rg-github-oauth" --name "your-app-name"
```

### Azure Portal Management:
1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to your App Service
3. Monitor metrics, logs, and configuration

## Scaling and Performance

### Scale Up (Better hardware):
```powershell
az appservice plan update --name "plan-github-oauth" --resource-group "rg-github-oauth" --sku B1
```

### Scale Out (More instances):
```powershell
az webapp config appsettings set --resource-group "rg-github-oauth" --name "your-app-name" --settings WEBSITE_INSTANCE_COUNT=2
```

## Cost Management

### Free Tier Limits:
- **Compute**: 60 minutes/day
- **Storage**: 1 GB
- **Bandwidth**: 165 MB/day outbound
- **Custom domains**: Not included

### Monitor Usage:
- Check Azure portal for resource usage
- Set up billing alerts
- Consider upgrading to Basic (B1) for production use (~$13/month)

## Security Best Practices

### Environment Variables:
- Never commit secrets to Git
- Use Azure Key Vault for sensitive data
- Rotate secrets regularly

### Network Security:
```powershell
# Restrict access to specific IPs (optional)
az webapp config access-restriction add --resource-group "rg-github-oauth" --name "your-app-name" --rule-name "AllowMyIP" --action Allow --ip-address "your.ip.address.here/32" --priority 100
```

### Enable HTTPS Only:
```powershell
az webapp update --resource-group "rg-github-oauth" --name "your-app-name" --https-only true
```

## Troubleshooting

### Common Issues:

1. **App won't start**:
   - Check Python version in runtime.txt
   - Verify startup command
   - Check application logs

2. **Environment variables not working**:
   - Verify they're set in Azure portal
   - Check case sensitivity
   - Restart the web app

3. **Git deployment fails**:
   - Check remote URL
   - Verify credentials
   - Try redeploying

4. **OAuth callback fails**:
   - Verify callback URL in GitHub OAuth app
   - Check CORS configuration
   - Verify HTTPS is working

### Debug Commands:
```powershell
# Check app settings
az webapp config appsettings list --resource-group "rg-github-oauth" --name "your-app-name"

# Restart the app
az webapp restart --resource-group "rg-github-oauth" --name "your-app-name"

# Check deployment status
az webapp deployment list --resource-group "rg-github-oauth" --name "your-app-name"
```

## Alternative Azure Deployment Options

### 1. GitHub Actions (CI/CD):
Create `.github/workflows/azure-deploy.yml` for automatic deployments

### 2. Azure Container Instances:
Deploy as a Docker container for more control

### 3. Azure Functions:
Serverless deployment option (requires code modifications)

## Example URLs After Deployment

- **Azure App**: `https://mike-github-oauth.azurewebsites.net`
- **GitHub Pages**: `https://mikestiers.github.io/workflows`
- **OAuth Callback**: `https://mike-github-oauth.azurewebsites.net/oauth/callback`

## Quick Start Commands

Here's everything in one place for quick reference:

```powershell
# 1. Install Azure CLI
winget install Microsoft.AzureCLI

# 2. Login to Azure
az login

# 3. Run deployment script
.\deploy-azure.bat

# 4. Test deployment
curl https://your-app-name.azurewebsites.net/health
```

## Next Steps

1. **Monitor your application** using Azure Application Insights
2. **Set up custom domain** if needed
3. **Configure CI/CD** using GitHub Actions
4. **Add logging and monitoring** for production use
5. **Consider backup and disaster recovery** strategies

## Support and Resources

- **Azure App Service Documentation**: https://docs.microsoft.com/en-us/azure/app-service/
- **Azure CLI Reference**: https://docs.microsoft.com/en-us/cli/azure/
- **Azure Free Account**: https://azure.microsoft.com/en-us/free/
- **Azure Pricing Calculator**: https://azure.microsoft.com/en-us/pricing/calculator/

🎉 **Congratulations!** Your GitHub OAuth proxy server is now running on Azure App Service!
