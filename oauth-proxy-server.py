#!/usr/bin/env python3
"""
GitHub OAuth Proxy Server

This server acts as a proxy for GitHub OAuth authentication,
handling the token exchange that can't be done securely from the browser.

Usage:
    python oauth-proxy-server.py

The server will run on http://localhost:8000
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

# Configuration
PORT = 8000
GITHUB_CLIENT_ID = "Ov23liXhJlhD3Xei3562"  # Your GitHub OAuth App Client ID
GITHUB_CLIENT_SECRET = "f06f6cf4d20cd8125aff7d634fd50449a62782c6"  # You'll need to set this - see instructions below

# Instructions for setting up GitHub OAuth App:
# 1. Go to https://github.com/settings/applications/new
# 2. Application name: "Workflow Trigger App"
# 3. Homepage URL: http://localhost:8000
# 4. Authorization callback URL: http://localhost:8000/oauth/callback
# 5. Click "Register application"
# 6. Copy the Client ID (already set above)
# 7. Generate a new client secret and set GITHUB_CLIENT_SECRET below
# 8. For production, use environment variables instead of hardcoding

class OAuthProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="docs", **kwargs)
    
    def do_GET(self):
        """Handle GET requests"""
        parsed_path = urllib.parse.urlparse(self.path)
        
        if parsed_path.path == "/oauth/login":
            self.handle_oauth_login()
        elif parsed_path.path == "/oauth/callback":
            self.handle_oauth_callback()
        elif parsed_path.path == "/api/user":
            self.handle_api_proxy()
        else:
            # Serve static files from docs directory
            super().do_GET()
    
    def do_POST(self):
        """Handle POST requests"""
        parsed_path = urllib.parse.urlparse(self.path)
        
        if parsed_path.path.startswith("/api/"):
            self.handle_api_proxy()
        else:
            self.send_error(404, "Not Found")
    
    def handle_oauth_login(self):
        """Initiate GitHub OAuth flow"""
        try:
            # Generate a secure random state value
            state = secrets.token_urlsafe(32)
            
            # Store state in a simple way (in production, use a proper session store)
            # For simplicity, we'll include it in the redirect and verify it later
            
            # Build GitHub OAuth URL
            params = {
                'client_id': GITHUB_CLIENT_ID,
                'redirect_uri': f'http://localhost:{PORT}/oauth/callback',
                'scope': 'workflow',
                'state': state
            }
            
            github_url = 'https://github.com/login/oauth/authorize?' + urllib.parse.urlencode(params)
            
            # Send redirect response
            self.send_response(302)
            self.send_header('Location', github_url)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
        except Exception as e:
            self.send_error_response(500, f"OAuth initiation failed: {str(e)}")
    
    def handle_oauth_callback(self):
        """Handle OAuth callback from GitHub"""
        try:
            parsed_path = urllib.parse.urlparse(self.path)
            query_params = urllib.parse.parse_qs(parsed_path.query)
            code = query_params.get('code', [None])[0]
            state = query_params.get('state', [None])[0]
            error = query_params.get('error', [None])[0]
            
            if error:
                self.send_html_response(f"""
                    <html><body>
                        <h1>OAuth Error</h1>
                        <p>Error: {error}</p>
                        <p>Description: {query_params.get('error_description', [''])[0]}</p>
                        <script>window.close();</script>
                    </body></html>
                """)
                return
            
            if not code:
                self.send_error(400, "Missing authorization code")
                return
            
            # Exchange code for access token
            token_data = self.exchange_code_for_token(code)
            
            if token_data.get('access_token'):
                # Success! Send the token back to the parent window
                access_token = token_data['access_token']
                self.send_html_response(f"""
                    <html><body>
                        <h1>Authentication Successful!</h1>
                        <p id="status">Sending token to main window...</p>
                        <p><em>This window will close automatically in a few seconds.</em></p>
                        <script>
                            console.log('OAuth callback page loaded');
                            console.log('Window opener exists:', !!window.opener);
                            
                            function sendTokenAndClose() {{
                                try {{
                                    if (window.opener && !window.opener.closed) {{
                                        console.log('Sending token to parent window');
                                        window.opener.postMessage({{
                                            type: 'oauth_success',
                                            access_token: '{access_token}'
                                        }}, 'http://localhost:{PORT}');
                                        
                                        document.getElementById('status').textContent = 'Token sent successfully! Closing window...';
                                        console.log('Token sent successfully');
                                        
                                        // Close after a longer delay to ensure message is received
                                        setTimeout(() => {{
                                            console.log('Closing popup window');
                                            window.close();
                                        }}, 2000);
                                    }} else {{
                                        console.error('Parent window not available');
                                        document.getElementById('status').textContent = 'Error: Parent window not available. Please close this window manually.';
                                    }}
                                }} catch (error) {{
                                    console.error('Error sending token:', error);
                                    document.getElementById('status').textContent = 'Error sending token. Please close this window manually.';
                                }}
                            }}
                            
                            // Wait a bit for the page to fully load, then send token
                            setTimeout(sendTokenAndClose, 500);
                        </script>
                    </body></html>
                """)
            else:
                self.send_html_response(f"""
                    <html><body>
                        <h1>Authentication Failed</h1>
                        <p>Failed to obtain access token.</p>
                        <script>
                            if (window.opener) {{
                                window.opener.postMessage({{
                                    type: 'oauth_error',
                                    error: 'Failed to obtain access token'
                                }}, 'http://localhost:{PORT}');
                            }}
                            setTimeout(() => window.close(), 2000);
                        </script>
                    </body></html>
                """)
                
        except Exception as e:
            self.log_error(f"OAuth callback error: {e}")
            self.send_error_response(500, f"OAuth callback failed: {str(e)}")
    
    def exchange_code_for_token(self, code):
        """Exchange authorization code for access token"""
        if not GITHUB_CLIENT_SECRET:
            raise ValueError("GITHUB_CLIENT_SECRET not configured. Please set it in the script or environment variable.")
        
        # Prepare token exchange request
        token_data = {
            'client_id': GITHUB_CLIENT_ID,
            'client_secret': GITHUB_CLIENT_SECRET,
            'code': code,
            'redirect_uri': f'http://localhost:{PORT}/oauth/callback'
        }
        
        # Make request to GitHub
        req_data = urllib.parse.urlencode(token_data).encode('utf-8')
        req = urllib.request.Request(
            'https://github.com/login/oauth/access_token',
            data=req_data,
            headers={
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        )
        
        with urllib.request.urlopen(req) as response:
            response_data = json.loads(response.read().decode('utf-8'))
            return response_data
    
    def handle_api_proxy(self):
        """Proxy API requests to GitHub with CORS headers"""
        try:
            # Get the authorization header
            auth_header = self.headers.get('Authorization')
            if not auth_header:
                self.send_error_response(401, "Missing Authorization header")
                return
            
            # Extract the GitHub API path
            api_path = self.path[4:]  # Remove '/api' prefix
            github_url = f"https://api.github.com{api_path}"
            
            # Prepare headers for GitHub API
            headers = {
                'Authorization': auth_header,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Workflow-Trigger-Proxy/1.0'
            }
            
            # Handle different HTTP methods
            if self.command == 'GET':
                req = urllib.request.Request(github_url, headers=headers)
            elif self.command == 'POST':
                # Read request body
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length) if content_length > 0 else b''
                
                headers['Content-Type'] = self.headers.get('Content-Type', 'application/json')
                req = urllib.request.Request(github_url, data=body, headers=headers)
            else:
                self.send_error_response(405, f"Method {self.command} not allowed")
                return
            
            # Make request to GitHub API
            try:
                with urllib.request.urlopen(req) as response:
                    response_data = response.read()
                    
                    # Send successful response with CORS headers
                    self.send_response(response.status)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
                    self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
                    self.end_headers()
                    self.wfile.write(response_data)
                    
            except urllib.error.HTTPError as e:
                # Forward HTTP errors from GitHub API
                error_data = e.read()
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(error_data)
                
        except Exception as e:
            self.log_error(f"API proxy error: {e}")
            self.send_error_response(500, f"API proxy failed: {str(e)}")
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
    
    def send_error_response(self, code, message):
        """Send JSON error response"""
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        error_data = json.dumps({"error": message}).encode('utf-8')
        self.wfile.write(error_data)
    
    def send_html_response(self, html_content):
        """Send HTML response"""
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(html_content.encode('utf-8'))
    
    def log_message(self, format, *args):
        """Override to add timestamps to logs"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        print(f"[{timestamp}] {format % args}")

def main():
    """Start the OAuth proxy server"""
    
    # Check if client secret is configured
    global GITHUB_CLIENT_SECRET
    if not GITHUB_CLIENT_SECRET:
        # Try to get from environment variable
        GITHUB_CLIENT_SECRET = os.environ.get('GITHUB_CLIENT_SECRET', '')
        
        if not GITHUB_CLIENT_SECRET:
            print("⚠️  WARNING: GITHUB_CLIENT_SECRET not configured!")
            print()
            print("To set up GitHub OAuth:")
            print("1. Go to https://github.com/settings/applications/new")
            print("2. Application name: 'Workflow Trigger App'")
            print(f"3. Homepage URL: http://localhost:{PORT}")
            print(f"4. Authorization callback URL: http://localhost:{PORT}/oauth/callback")
            print("5. Click 'Register application'")
            print("6. Copy the Client Secret and either:")
            print("   - Set GITHUB_CLIENT_SECRET environment variable, or")
            print("   - Edit this script and set GITHUB_CLIENT_SECRET variable")
            print()
            
            # Allow user to input the secret
            try:
                GITHUB_CLIENT_SECRET = input("Enter your GitHub Client Secret (or press Enter to continue without OAuth): ").strip()
            except KeyboardInterrupt:
                print("\nExiting...")
                return
            
            if not GITHUB_CLIENT_SECRET:
                print("⚠️  Running without OAuth support. Only static file serving will work.")
    
    # Start the server
    with socketserver.TCPServer(("", PORT), OAuthProxyHandler) as httpd:
        print(f"🚀 OAuth Proxy Server running on http://localhost:{PORT}")
        print(f"📁 Serving files from: {os.path.abspath('docs')}")
        print(f"🔐 OAuth endpoint: http://localhost:{PORT}/oauth/login")
        print()
        print("Open your browser and navigate to http://localhost:8000/github-workflow-oauth.html")
        print("Press Ctrl+C to stop the server")
        print()
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Server stopped")

if __name__ == "__main__":
    main()
