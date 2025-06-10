# Azure Deployment Scripts

This folder contains scripts to deploy your GitHub OAuth Proxy Server to Azure App Service.

## Files

- `deploy-azure.ps1` - Full-featured PowerShell deployment script
- `deploy-azure-quick.ps1` - Simplified quick deployment script  
- `deploy-azure.bat` - Batch file wrapper for easy execution
- `oauth-proxy-server-production.py` - Production-ready Python server

## Prerequisites

1. **Azure CLI** installed and logged in
   ```powershell
   winget install Microsoft.AzureCLI
   az login
   ```

2. **Git repository** initialized in this folder
   ```powershell
   git init
   git add .
   git commit -m "Initial commit"
   ```

3. **GitHub OAuth App** configured at https://github.com/settings/applications/new
   - Application name: "Workflow Trigger App"
   - Homepage URL: Will be your Azure app URL
   - Authorization callback URL: `https://YOUR-APP-NAME.azurewebsites.net/oauth/callback`

## Quick Deployment

For a simple deployment with minimal prompts:

```powershell
.\deploy-azure-quick.ps1 -AppName "my-oauth-proxy" -GitHubClientId "your_client_id" -GitHubClientSecret "your_client_secret"
```

## Full Deployment

For a deployment with all options and error handling:

```powershell
# Interactive mode (will prompt for values)
.\deploy-azure.ps1

# Or provide all parameters
.\deploy-azure.ps1 -AppName "my-oauth-proxy" -GitHubClientId "your_client_id" -GitHubClientSecret "your_client_secret" -Location "westus2"
```

### Parameters

- `-AppName` - Unique name for your Azure App Service (required)
- `-ResourceGroup` - Resource group name (default: rg-{AppName})
- `-Location` - Azure region (default: eastus)
- `-GitHubClientId` - Your GitHub OAuth App Client ID (required)
- `-GitHubClientSecret` - Your GitHub OAuth App Client Secret (required)
- `-AllowedOrigins` - Comma-separated CORS origins (default: *)
- `-SkipGitDeploy` - Skip the Git deployment step
- `-Help` - Show help information

## Using the Batch File

Double-click `deploy-azure.bat` or run it from Command Prompt:

```cmd
deploy-azure.bat -AppName "my-oauth-proxy" -GitHubClientId "your_client_id" -GitHubClientSecret "your_client_secret"
```

## After Deployment

1. **Update GitHub OAuth App** callback URL to:
   `https://YOUR-APP-NAME.azurewebsites.net/oauth/callback`

2. **Update your client-side code** to use the Azure URL:
   ```javascript
   const PROXY_BASE_URL = 'https://YOUR-APP-NAME.azurewebsites.net';
   ```

3. **Test the deployment**:
   ```powershell
   curl https://YOUR-APP-NAME.azurewebsites.net/health
   ```

## Management Commands

```powershell
# View live logs
az webapp log tail --resource-group "rg-YOUR-APP-NAME" --name "YOUR-APP-NAME"

# Restart the app
az webapp restart --resource-group "rg-YOUR-APP-NAME" --name "YOUR-APP-NAME"

# Update environment variables
az webapp config appsettings set --resource-group "rg-YOUR-APP-NAME" --name "YOUR-APP-NAME" --settings NEW_VAR="value"

# Delete all resources
az group delete --name "rg-YOUR-APP-NAME" --yes
```

## Troubleshooting

### Common Issues

1. **App name already taken**: Choose a different unique name
2. **Git deployment fails**: Check that all files are committed
3. **OAuth not working**: Verify callback URL in GitHub settings
4. **500 errors**: Check logs with `az webapp log tail`

### Cost Management

- **Free tier**: 60 minutes/day compute time
- **Upgrade to Basic**: ~$13/month for production use
- **Monitor usage**: Check Azure portal regularly

## Security Notes

- Never commit secrets to Git
- Use environment variables for sensitive data
- Consider Azure Key Vault for production secrets
- Regularly rotate your OAuth client secret
