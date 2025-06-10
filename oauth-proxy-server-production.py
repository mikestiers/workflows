#!/usr/bin/env python3
"""
GitHub OAuth Proxy Server - Production Ready

This server acts as a proxy for GitHub OAuth authentication,
handling the token exchange that can't be done securely from the browser.

Usage:
    python oauth-proxy-server-production.py

Environment Variables:
    GITHUB_CLIENT_ID: Your GitHub OAuth App Client ID
    GITHUB_CLIENT_SECRET: Your GitHub OAuth App Client Secret
    PORT: Port to run the server on (default: 8000)
    ALLOWED_ORIGINS: Comma-separated list of allowed origins for CORS
"""

import os
import json
import urllib.parse
import urllib.request
import http.server
import socketserver
from datetime import datetime
import secrets
import base64

# Configuration from environment variables
GITHUB_CLIENT_ID = os.environ.get('GITHUB_CLIENT_ID')
GITHUB_CLIENT_SECRET = os.environ.get('GITHUB_CLIENT_SECRET')
PORT = int(os.environ.get('PORT', 443))

# CORS configuration
ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', '*').split(',')
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS if origin.strip()]

# Validate required environment variables
if not GITHUB_CLIENT_ID:
    print("❌ ERROR: GITHUB_CLIENT_ID environment variable is required")
    print("Set it with: export GITHUB_CLIENT_ID=your_client_id")
    exit(1)

if not GITHUB_CLIENT_SECRET:
    print("❌ ERROR: GITHUB_CLIENT_SECRET environment variable is required")
    print("Set it with: export GITHUB_CLIENT_SECRET=your_client_secret")
    exit(1)

print(f"🚀 Starting OAuth Proxy Server on port {PORT}")
print(f"📋 Client ID: {GITHUB_CLIENT_ID}")
print(f"🔒 Client Secret: {'*' * len(GITHUB_CLIENT_SECRET)}")
print(f"🌐 Allowed Origins: {ALLOWED_ORIGINS}")

class OAuthProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # For production, don't serve static files from docs directory
        # Instead, handle all requests programmatically
        super().__init__(*args, directory=None, **kwargs)
    
    def do_GET(self):
        """Handle GET requests"""
        parsed_path = urllib.parse.urlparse(self.path)
        
        if parsed_path.path == "/":
            self.handle_root()
        elif parsed_path.path == "/health":
            self.handle_health_check()
        elif parsed_path.path == "/oauth/authorize":
            self.handle_oauth_authorize()
        elif parsed_path.path == "/oauth/callback":
            self.handle_oauth_callback()
        elif parsed_path.path.startswith("/api/"):
            self.handle_api_proxy()
        else:
            self.handle_404()
    
    def do_POST(self):
        """Handle POST requests"""
        parsed_path = urllib.parse.urlparse(self.path)
        
        if parsed_path.path.startswith("/api/"):
            self.handle_api_proxy()
        else:
            self.handle_404()
    
    def do_OPTIONS(self):
        """Handle preflight CORS requests"""
        self.add_cors_headers()
        self.send_response(200)
        self.end_headers()
    
    def add_cors_headers(self):
        """Add CORS headers to response"""
        origin = self.headers.get('Origin')
        
        # Check if origin is allowed
        if ALLOWED_ORIGINS == ['*'] or origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin or '*')
        elif len(ALLOWED_ORIGINS) > 0:
            self.send_header('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0])
        else:
            self.send_header('Access-Control-Allow-Origin', '*')
            
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept')
        self.send_header('Access-Control-Allow-Credentials', 'true')
    
    def handle_root(self):
        """Handle root path"""
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.add_cors_headers()
        self.end_headers()
        
        response = {
            "status": "ok",
            "service": "GitHub OAuth Proxy Server",
            "version": "1.0.0",
            "endpoints": {
                "health": "/health",
                "oauth_authorize": "/oauth/authorize",
                "oauth_callback": "/oauth/callback",
                "api_proxy": "/api/*"
            }
        }
        
        self.wfile.write(json.dumps(response, indent=2).encode())
    
    def handle_health_check(self):
        """Handle health check endpoint"""
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.add_cors_headers()
        self.end_headers()
        
        response = {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "service": "GitHub OAuth Proxy Server"
        }
        
        self.wfile.write(json.dumps(response).encode())
    
    def handle_oauth_authorize(self):
        """Initiate GitHub OAuth flow"""
        try:
            # Parse query parameters
            parsed_path = urllib.parse.urlparse(self.path)
            query_params = urllib.parse.parse_qs(parsed_path.query)
            
            # Get state parameter from client
            state = query_params.get('state', [None])[0]
            if not state:
                state = secrets.token_urlsafe(32)
            
            # Build GitHub OAuth URL
            github_oauth_params = {
                'client_id': GITHUB_CLIENT_ID,
                'redirect_uri': f"{self.get_base_url()}/oauth/callback",
                'scope': 'repo workflow',
                'state': state,
                'allow_signup': 'true'
            }
            
            github_oauth_url = 'https://github.com/login/oauth/authorize?' + urllib.parse.urlencode(github_oauth_params)
            
            print(f"🔐 Redirecting to GitHub OAuth: {github_oauth_url}")
            
            # Redirect to GitHub OAuth
            self.send_response(302)
            self.send_header('Location', github_oauth_url)
            self.add_cors_headers()
            self.end_headers()
            
        except Exception as e:
            print(f"❌ Error in OAuth authorize: {e}")
            self.send_error_response(500, f"OAuth authorization error: {str(e)}")
    
    def handle_oauth_callback(self):
        """Handle OAuth callback from GitHub"""
        try:
            # Parse query parameters
            parsed_path = urllib.parse.urlparse(self.path)
            query_params = urllib.parse.parse_qs(parsed_path.query)
            
            # Check for error
            error = query_params.get('error', [None])[0]
            if error:
                error_description = query_params.get('error_description', ['Unknown error'])[0]
                print(f"❌ OAuth error: {error} - {error_description}")
                self.send_oauth_result_page(None, f"OAuth error: {error_description}")
                return
            
            # Get authorization code
            code = query_params.get('code', [None])[0]
            state = query_params.get('state', [None])[0]
            
            if not code:
                print("❌ No authorization code received")
                self.send_oauth_result_page(None, "No authorization code received")
                return
            
            print(f"✅ Received authorization code: {code[:10]}...")
            
            # Exchange code for access token
            token_data = {
                'client_id': GITHUB_CLIENT_ID,
                'client_secret': GITHUB_CLIENT_SECRET,
                'code': code,
                'redirect_uri': f"{self.get_base_url()}/oauth/callback"
            }
            
            token_request = urllib.request.Request(
                'https://github.com/login/oauth/access_token',
                data=urllib.parse.urlencode(token_data).encode(),
                headers={
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            )
            
            with urllib.request.urlopen(token_request) as response:
                token_response = json.loads(response.read().decode())
            
            # Check for token error
            if 'error' in token_response:
                error_msg = token_response.get('error_description', token_response['error'])
                print(f"❌ Token exchange error: {error_msg}")
                self.send_oauth_result_page(None, f"Token exchange error: {error_msg}")
                return
            
            access_token = token_response.get('access_token')
            
            if not access_token:
                print("❌ No access token received")
                self.send_oauth_result_page(None, "No access token received")
                return
            
            print(f"✅ Access token received: {access_token[:10]}...")
            
            # Send success page with token
            self.send_oauth_result_page(access_token, None)
            
        except Exception as e:
            print(f"❌ Error in OAuth callback: {e}")
            self.send_oauth_result_page(None, f"OAuth callback error: {str(e)}")
    
    def send_oauth_result_page(self, access_token, error):
        """Send OAuth result page that communicates with parent window"""
        self.send_response(200)
        self.send_header('Content-type', 'text/html')
        self.add_cors_headers()
        self.end_headers()
        
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
                .spinner {{
                    display: inline-block;
                    width: 20px;
                    height: 20px;
                    border: 2px solid #f3f3f3;
                    border-top: 2px solid #3498db;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-right: 10px;
                }}
                @keyframes spin {{
                    0% {{ transform: rotate(0deg); }}
                    100% {{ transform: rotate(360deg); }}
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <h2 class="{status_class}">
                    {'✅' if access_token else '❌'} GitHub OAuth
                </h2>
                <p>{message}</p>
                <p id="status"><span class="spinner"></span>Communicating with parent window...</p>
            </div>
            
            <script>
                // Send result to parent window
                const resultData = {json.dumps(result_data)};
                
                try {{
                    if (window.opener) {{
                        window.opener.postMessage(resultData, '*');
                        document.getElementById('status').innerHTML = '✅ Result sent to parent window. You can close this tab.';
                    }} else {{
                        document.getElementById('status').innerHTML = '⚠️ No parent window found. Please close this tab manually.';
                    }}
                }} catch (error) {{
                    console.error('Error sending message to parent window:', error);
                    document.getElementById('status').innerHTML = '❌ Error communicating with parent window: ' + error.message;
                }}
                
                // Auto-close after 3 seconds if successful
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
        
        self.wfile.write(html.encode())
    
    def handle_api_proxy(self):
        """Proxy requests to GitHub API"""
        try:
            # Remove /api prefix from path
            api_path = self.path.replace('/api', '', 1)
            github_url = f'https://api.github.com{api_path}'
            
            # Get authorization header
            auth_header = self.headers.get('Authorization')
            
            if not auth_header:
                self.send_error_response(401, "Authorization header required")
                return
            
            # Prepare headers for GitHub API
            headers = {
                'Authorization': auth_header,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'GitHub-OAuth-Proxy/1.0'
            }
            
            # Handle different HTTP methods
            if self.command == 'GET':
                request = urllib.request.Request(github_url, headers=headers)
            elif self.command == 'POST':
                # Read request body
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                
                headers['Content-Type'] = self.headers.get('Content-Type', 'application/json')
                request = urllib.request.Request(github_url, data=post_data, headers=headers)
            else:
                self.send_error_response(405, f"Method {self.command} not supported")
                return
            
            print(f"🔄 Proxying {self.command} request to: {github_url}")
            
            # Make request to GitHub API
            try:
                with urllib.request.urlopen(request) as response:
                    status_code = response.getcode()
                    response_data = response.read()
                    
                    # Forward the response
                    self.send_response(status_code)
                    self.send_header('Content-type', 'application/json')
                    self.add_cors_headers()
                    self.end_headers()
                    self.wfile.write(response_data)
                    
                    print(f"✅ API request successful: {status_code}")
                    
            except urllib.error.HTTPError as e:
                # Forward HTTP errors from GitHub API
                error_data = e.read().decode() if e.fp else "Unknown error"
                print(f"❌ GitHub API error: {e.code} - {error_data}")
                
                self.send_response(e.code)
                self.send_header('Content-type', 'application/json')
                self.add_cors_headers()
                self.end_headers()
                self.wfile.write(error_data.encode())
                
        except Exception as e:
            print(f"❌ Error in API proxy: {e}")
            self.send_error_response(500, f"API proxy error: {str(e)}")
    
    def handle_404(self):
        """Handle 404 errors"""
        self.send_error_response(404, "Endpoint not found")
    
    def send_error_response(self, status_code, message):
        """Send JSON error response"""
        self.send_response(status_code)
        self.send_header('Content-type', 'application/json')
        self.add_cors_headers()
        self.end_headers()
        
        error_response = {
            "error": True,
            "status": status_code,
            "message": message,
            "timestamp": datetime.now().isoformat()
        }
        
        self.wfile.write(json.dumps(error_response).encode())
    def get_base_url(self):
        """Get the base URL of the server"""
        # In production, this should be your deployed server URL
        # For now, construct from the Host header
        host = self.headers.get('Host', f'localhost:{PORT}')
        
        # Check if we're running on HTTPS (common for cloud deployments)
        if ('herokuapp.com' in host or 'railway.app' in host or 'render.com' in host or 
            'azurewebsites.net' in host or 'vercel.app' in host or 'netlify.app' in host):
            return f'https://{host}'
        else:
            return f'http://{host}'
    
    def log_message(self, format, *args):
        """Override log message to add timestamp"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        print(f"[{timestamp}] {format % args}")

def main():
    """Main function to start the server"""
    try:
        with socketserver.TCPServer(("", PORT), OAuthProxyHandler) as httpd:
            print(f"🌟 GitHub OAuth Proxy Server running on port {PORT}")
            print(f"🔗 Health check: http://localhost:{PORT}/health")
            print(f"🔐 OAuth authorize: http://localhost:{PORT}/oauth/authorize")
            print("🛑 Press Ctrl+C to stop the server")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}")

if __name__ == "__main__":
    main()
