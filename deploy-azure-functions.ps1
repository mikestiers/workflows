# Deploy OAuth Proxy Server to Azure Functions
# Simple deployment script for Azure Functions

param(
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroupName,
    
    [Parameter(Mandatory=$true)]
    [string]$FunctionAppName,
    
    [Parameter(Mandatory=$true)]
    [string]$GitHubClientId,
    
    [Parameter(Mandatory=$true)]
    [string]$GitHubClientSecret,
    
    [string]$Location = "Canada Central",
    [string]$StorageAccountName = ($FunctionAppName + "storage").ToLower() -replace '[^a-z0-9]'
)

Write-Host "Starting Azure Functions deployment..." -ForegroundColor Green

# Check if Azure CLI is installed
try {
    az --version | Out-Null
} catch {
    Write-Error "Azure CLI is not installed or not in PATH. Please install it first."
    exit 1
}

# Login check
Write-Host "Checking Azure login status..." -ForegroundColor Yellow
$loginStatus = az account show 2>$null
if (-not $loginStatus) {
    Write-Host "Please login to Azure..." -ForegroundColor Yellow
    az login
}

# Create resource group if it doesn't exist
Write-Host "Creating resource group: $ResourceGroupName" -ForegroundColor Yellow
az group create --name $ResourceGroupName --location $Location

# Create storage account
Write-Host "Creating storage account: $StorageAccountName" -ForegroundColor Yellow
az storage account create `
    --name $StorageAccountName `
    --resource-group $ResourceGroupName `
    --location $Location `
    --sku Standard_LRS

# Create Function App
Write-Host "Creating Function App: $FunctionAppName" -ForegroundColor Yellow
az functionapp create `
    --resource-group $ResourceGroupName `
    --consumption-plan-location $Location `
    --runtime python `
    --runtime-version 3.11 `
    --functions-version 4 `
    --name $FunctionAppName `
    --storage-account $StorageAccountName `
    --os-type Linux

# Configure app settings
Write-Host "Configuring application settings..." -ForegroundColor Yellow
az functionapp config appsettings set `
    --name $FunctionAppName `
    --resource-group $ResourceGroupName `
    --settings `
    "GITHUB_CLIENT_ID=$GitHubClientId" `
    "GITHUB_CLIENT_SECRET=$GitHubClientSecret" `
    "ALLOWED_ORIGINS=*" `
    "FUNCTIONS_WORKER_RUNTIME=python"

# Create function structure for deployment
Write-Host "Preparing function files..." -ForegroundColor Yellow

# Create temporary deployment directory
$deployDir = Join-Path $env:TEMP "azure-functions-deploy"
if (Test-Path $deployDir) {
    Remove-Item $deployDir -Recurse -Force
}
New-Item -ItemType Directory -Path $deployDir -Force | Out-Null

# Create host.json
$hostJson = @{
    version = "2.0"
    extensionBundle = @{
        id = "Microsoft.Azure.Functions.ExtensionBundle"
        version = "[4.*, 5.0.0)"
    }
    functionTimeout = "00:05:00"
} | ConvertTo-Json -Depth 3

Set-Content -Path (Join-Path $deployDir "host.json") -Value $hostJson

# Create requirements.txt
Set-Content -Path (Join-Path $deployDir "requirements.txt") -Value "# No external dependencies required"

# Create function directory and files
$functionDir = Join-Path $deployDir "HttpTrigger"
New-Item -ItemType Directory -Path $functionDir -Force | Out-Null

# Create function.json
$functionJson = @{
    scriptFile = "__init__.py"
    bindings = @(
        @{
            authLevel = "anonymous"
            type = "httpTrigger"
            direction = "in"
            name = "req"
            methods = @("get", "post", "options")
            route = "{*route}"
        },
        @{
            type = "http"
            direction = "out"
            name = '$return'
        }
    )
} | ConvertTo-Json -Depth 4

Set-Content -Path (Join-Path $functionDir "function.json") -Value $functionJson

# Convert the Python server to Azure Function format
$pythonCode = @'
import azure.functions as func
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime
import secrets

# Configuration from environment variables
GITHUB_CLIENT_ID = os.environ.get('GITHUB_CLIENT_ID')
GITHUB_CLIENT_SECRET = os.environ.get('GITHUB_CLIENT_SECRET')
ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', '*').split(',')
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS if origin.strip()]

def main(req: func.HttpRequest) -> func.HttpResponse:
    """Main Azure Function entry point"""
    
    # Get request details
    method = req.method
    path = req.url.split('?')[0].split('/')[-1] if '/' in req.url else ''
    full_path = '/' + '/'.join(req.url.split('/')[3:]) if len(req.url.split('/')) > 3 else '/'
    
    # Add CORS headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
        'Access-Control-Allow-Credentials': 'true',
        'Content-Type': 'application/json'
    }
    
    # Handle OPTIONS (CORS preflight)
    if method == 'OPTIONS':
        return func.HttpResponse("", status_code=200, headers=headers)
    
    # Parse query parameters
    query_params = dict(req.params)
    
    try:
        # Route requests
        if full_path == '/' or full_path == '':
            return handle_root(headers)
        elif 'health' in full_path:
            return handle_health_check(headers)
        elif 'oauth/authorize' in full_path:
            return handle_oauth_authorize(query_params, req, headers)
        elif 'oauth/callback' in full_path:
            return handle_oauth_callback(query_params, req, headers)
        elif 'api/' in full_path:
            return handle_api_proxy(req, headers)
        else:
            return func.HttpResponse(
                json.dumps({"error": "Endpoint not found"}),
                status_code=404,
                headers=headers
            )
            
    except Exception as e:
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            status_code=500,
            headers=headers
        )

def handle_root(headers):
    """Handle root path"""
    response = {
        "status": "ok",
        "service": "GitHub OAuth Proxy Server",
        "version": "1.0.0",
        "endpoints": {
            "health": "/api/HttpTrigger/health",
            "oauth_authorize": "/api/HttpTrigger/oauth/authorize",
            "oauth_callback": "/api/HttpTrigger/oauth/callback",
            "api_proxy": "/api/HttpTrigger/api/*"
        }
    }
    return func.HttpResponse(json.dumps(response, indent=2), headers=headers)

def handle_health_check(headers):
    """Handle health check endpoint"""
    response = {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "GitHub OAuth Proxy Server"
    }
    return func.HttpResponse(json.dumps(response), headers=headers)

def handle_oauth_authorize(query_params, req, headers):
    """Initiate GitHub OAuth flow"""
    if not GITHUB_CLIENT_ID:
        return func.HttpResponse(
            json.dumps({"error": "GITHUB_CLIENT_ID not configured"}),
            status_code=500,
            headers=headers
        )
    
    # Get state parameter from client
    state = query_params.get('state') or secrets.token_urlsafe(32)
    
    # Build GitHub OAuth URL
    base_url = f"https://{req.url.split('/')[2]}"
    github_oauth_params = {
        'client_id': GITHUB_CLIENT_ID,
        'redirect_uri': f"{base_url}/api/HttpTrigger/oauth/callback",
        'scope': 'repo workflow',
        'state': state,
        'allow_signup': 'true'
    }
    
    github_oauth_url = 'https://github.com/login/oauth/authorize?' + urllib.parse.urlencode(github_oauth_params)
    
    # Return redirect response
    redirect_headers = dict(headers)
    redirect_headers['Location'] = github_oauth_url
    
    return func.HttpResponse("", status_code=302, headers=redirect_headers)

def handle_oauth_callback(query_params, req, headers):
    """Handle OAuth callback from GitHub"""
    # Check for error
    if 'error' in query_params:
        error_description = query_params.get('error_description', 'Unknown error')
        return send_oauth_result_page(None, f"OAuth error: {error_description}", headers)
    
    # Get authorization code
    code = query_params.get('code')
    if not code:
        return send_oauth_result_page(None, "No authorization code received", headers)
    
    # Exchange code for access token
    base_url = f"https://{req.url.split('/')[2]}"
    token_data = {
        'client_id': GITHUB_CLIENT_ID,
        'client_secret': GITHUB_CLIENT_SECRET,
        'code': code,
        'redirect_uri': f"{base_url}/api/HttpTrigger/oauth/callback"
    }
    
    token_request = urllib.request.Request(
        'https://github.com/login/oauth/access_token',
        data=urllib.parse.urlencode(token_data).encode(),
        headers={
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    )
    
    try:
        with urllib.request.urlopen(token_request) as response:
            token_response = json.loads(response.read().decode())
        
        if 'error' in token_response:
            error_msg = token_response.get('error_description', token_response['error'])
            return send_oauth_result_page(None, f"Token exchange error: {error_msg}", headers)
        
        access_token = token_response.get('access_token')
        if not access_token:
            return send_oauth_result_page(None, "No access token received", headers)
        
        return send_oauth_result_page(access_token, None, headers)
        
    except Exception as e:
        return send_oauth_result_page(None, f"OAuth callback error: {str(e)}", headers)

def send_oauth_result_page(access_token, error, headers):
    """Send OAuth result page that communicates with parent window"""
    if access_token:
        result_data = {
            'type': 'GITHUB_OAUTH_SUCCESS',
            'access_token': access_token
        }
        message = "Authentication successful! You can close this window."
        status_class = "success"
    else:
        result_data = {
            'type': 'GITHUB_OAUTH_ERROR',
            'error': error or 'Unknown error'
        }
        message = f"Authentication failed: {error}"
        status_class = "error"
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>GitHub OAuth Result</title>
        <style>
            body {{
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background-color: #f5f5f5;
            }}
            .container {{
                text-align: center;
                padding: 40px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                max-width: 400px;
            }}
            .success {{ color: #28a745; }}
            .error {{ color: #dc3545; }}
        </style>
    </head>
    <body>        <div class="container">
            <h2 class="{status_class}">
                GitHub OAuth
            </h2>
            <p>{message}</p>
        </div>
        
        <script>
            const resultData = {json.dumps(result_data)};
            
            try {{
                if (window.opener) {{
                    window.opener.postMessage(resultData, '*');
                }}
            }} catch (error) {{
                console.error('Error sending message to parent window:', error);
            }}
            
            if ({json.dumps(bool(access_token))}) {{
                setTimeout(() => {{
                    try {{
                        window.close();
                    }} catch (e) {{
                        console.log('Could not auto-close window');
                    }}
                }}, 3000);
            }}
        </script>
    </body>
    </html>
    """
    
    html_headers = dict(headers)
    html_headers['Content-Type'] = 'text/html'
    return func.HttpResponse(html, headers=html_headers)

def handle_api_proxy(req, headers):
    """Proxy requests to GitHub API"""
    # Extract API path from the full URL
    url_parts = req.url.split('/')
    api_index = -1
    for i, part in enumerate(url_parts):
        if part == 'api' and i < len(url_parts) - 1:
            api_index = i + 1
            break
    
    if api_index == -1:
        return func.HttpResponse(
            json.dumps({"error": "Invalid API path"}),
            status_code=400,
            headers=headers
        )
    
    api_path = '/' + '/'.join(url_parts[api_index:])
    github_url = f'https://api.github.com{api_path}'
    
    # Get authorization header
    auth_header = req.headers.get('Authorization')
    if not auth_header:
        return func.HttpResponse(
            json.dumps({"error": "Authorization header required"}),
            status_code=401,
            headers=headers
        )
    
    # Prepare headers for GitHub API
    api_headers = {
        'Authorization': auth_header,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'GitHub-OAuth-Proxy/1.0'
    }
    
    try:
        if req.method == 'GET':
            request = urllib.request.Request(github_url, headers=api_headers)
        elif req.method == 'POST':
            body = req.get_body()
            api_headers['Content-Type'] = 'application/json'
            request = urllib.request.Request(github_url, data=body, headers=api_headers)
        else:
            return func.HttpResponse(
                json.dumps({"error": f"Method {req.method} not supported"}),
                status_code=405,
                headers=headers
            )
        
        with urllib.request.urlopen(request) as response:
            response_data = response.read()
            return func.HttpResponse(response_data, headers=headers)
            
    except urllib.error.HTTPError as e:
        error_data = e.read().decode() if e.fp else "Unknown error"
        return func.HttpResponse(error_data, status_code=e.code, headers=headers)
    except Exception as e:
        return func.HttpResponse(
            json.dumps({"error": f"API proxy error: {str(e)}"}),
            status_code=500,
            headers=headers
        )
'@

Set-Content -Path (Join-Path $functionDir "__init__.py") -Value $pythonCode

# Deploy to Azure Functions
Write-Host "Deploying to Azure Functions..." -ForegroundColor Yellow
Push-Location $deployDir
try {
    func azure functionapp publish $FunctionAppName --python
} catch {
    # Fallback to zip deployment
    Write-Host "func CLI not found, using zip deployment..." -ForegroundColor Yellow
    
    # Create zip file
    $zipPath = Join-Path $env:TEMP "function-app.zip"
    Compress-Archive -Path "$deployDir\*" -DestinationPath $zipPath -Force
    
    # Deploy via Azure CLI
    az functionapp deployment source config-zip `
        --resource-group $ResourceGroupName `
        --name $FunctionAppName `
        --src $zipPath
}
finally {
    Pop-Location
}

# Clean up
Remove-Item $deployDir -Recurse -Force -ErrorAction SilentlyContinue

# Get the function URL
$functionUrl = az functionapp show --name $FunctionAppName --resource-group $ResourceGroupName --query "defaultHostName" --output tsv

Write-Host ""
Write-Host "Deployment completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Function App URL: https://$functionUrl" -ForegroundColor Cyan
Write-Host "Health Check: https://$functionUrl/api/HttpTrigger/health" -ForegroundColor Cyan
Write-Host "OAuth Authorize: https://$functionUrl/api/HttpTrigger/oauth/authorize" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Update your GitHub OAuth App callback URL to: https://$functionUrl/api/HttpTrigger/oauth/callback"
Write-Host "2. Test the health endpoint to ensure it's working"
Write-Host "3. Configure any additional CORS settings if needed"
Write-Host ""
