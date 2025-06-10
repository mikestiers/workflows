# GitHub OAuth Proxy Server

A Python-based proxy server that handles GitHub OAuth authentication for browser-based applications, solving CORS issues with GitHub's OAuth endpoints.

## Quick Start

### 1. Set up GitHub OAuth App

1. Go to [GitHub OAuth Apps](https://github.com/settings/applications/new)
2. Fill in the form:
   - **Application name**: `Workflow Trigger App`
   - **Homepage URL**: `http://localhost:8000`
   - **Authorization callback URL**: `http://localhost:8000/oauth/callback`
   - **Application description**: (optional)
3. Click "Register application"
4. Copy the **Client ID** (already set in the code)
5. Generate a new **Client Secret**

### 2. Start the Proxy Server

```bash
# Method 1: Set client secret as environment variable (recommended)
set GITHUB_CLIENT_SECRET=your_client_secret_here
python oauth-proxy-server.py

# Method 2: Enter client secret when prompted
python oauth-proxy-server.py
# Then enter your client secret when asked

# Method 3: Edit the script directly (not recommended)
# Open oauth-proxy-server.py and set GITHUB_CLIENT_SECRET variable
```

### 3. Open the Application

Once the server is running, open your browser and navigate to:
```
http://localhost:8000/github-workflow-oauth-proxy.html
```

## How It Works

### The Problem
- GitHub's OAuth endpoints don't allow direct browser requests due to CORS policy
- Browser-based applications can't securely store client secrets
- Traditional OAuth flows require server-side token exchange

### The Solution
This proxy server:
1. **Serves static files** from the `docs/` directory
2. **Handles OAuth flow** by redirecting to GitHub and processing callbacks
3. **Proxies API requests** to GitHub with proper CORS headers
4. **Maintains security** by keeping the client secret server-side

### Authentication Flow
1. User clicks "Authenticate with GitHub"
2. Browser opens popup to `http://localhost:8000/oauth/login`
3. Server redirects to GitHub OAuth authorization
4. User authorizes the application on GitHub
5. GitHub redirects back to `http://localhost:8000/oauth/callback`
6. Server exchanges authorization code for access token
7. Server sends token back to main window via postMessage
8. Main window stores token and enables workflow triggering

### API Proxying
All GitHub API requests are routed through the proxy:
- Original: `https://api.github.com/user`
- Proxied: `http://localhost:8000/api/user`

The proxy adds proper CORS headers and forwards requests with authentication.

## File Structure

```
oauth-proxy-server.py          # Main proxy server
docs/
  ├── github-workflow-oauth-proxy.html  # Updated HTML page that works with proxy
  └── github-workflow-oauth.html        # Original page (for reference)
```

## Features

✅ **Secure OAuth Flow** - Proper server-side token exchange  
✅ **CORS Handling** - Eliminates browser CORS restrictions  
✅ **Static File Serving** - Serves HTML/CSS/JS from docs folder  
✅ **API Proxying** - Routes GitHub API calls through proxy  
✅ **Error Handling** - Comprehensive error messages and logging  
✅ **Easy Setup** - Simple Python script with clear instructions  

## Security Notes

- Client secret is kept server-side (never exposed to browser)
- Access tokens are only stored in browser localStorage
- CORS headers are properly configured
- OAuth state parameter prevents CSRF attacks

## Development vs Production

This setup is perfect for:
- **Local development** ✅
- **Internal tools** ✅
- **Proof of concepts** ✅

For production deployment, consider:
- Using a proper web framework (Flask, FastAPI, etc.)
- Adding rate limiting and caching
- Using a secure session store
- Implementing proper logging and monitoring
- Using HTTPS with valid certificates

## Troubleshooting

### "GITHUB_CLIENT_SECRET not configured"
- Set the environment variable: `set GITHUB_CLIENT_SECRET=your_secret`
- Or enter it when prompted by the script

### "Popup blocked"
- Allow popups for localhost in your browser settings

### "OAuth callback failed"
- Check that your GitHub OAuth app callback URL is exactly: `http://localhost:8000/oauth/callback`
- Verify your client secret is correct

### "API requests failing"
- Make sure the proxy server is running on port 8000
- Check browser console for specific error messages

## Requirements

- Python 3.6+
- No additional packages required (uses standard library only)
