// Authentication handling module
import { CONFIG } from './config.js';
import { appendAuthMessage } from './ui.js';

export class AuthManager {
  constructor() {
    this.accessToken = '';
    this.authenticationInProgress = false;
    
    // DOM elements
    this.authButton = null;
    this.logoutButton = null;
    this.authStatus = null;
    this.workflowButton = null;
  }

  /**
   * Initialize the auth manager with DOM elements
   */
  init(authButton, logoutButton, authStatus, workflowButton) {
    this.authButton = authButton;
    this.logoutButton = logoutButton;
    this.authStatus = authStatus;
    this.workflowButton = workflowButton;

    // Restore token from localStorage if available
    this.restoreTokenFromStorage();
    
    // Set up event listeners
    this.setupEventListeners();
  }

  /**
   * Restore authentication token from localStorage
   */
  restoreTokenFromStorage() {
    const storedToken = localStorage.getItem('github_token');
    if (storedToken) {
      this.accessToken = storedToken;
      this.authButton.textContent = 'Re-Authenticate with GitHub';
      this.logoutButton.style.display = 'block';
      this.workflowButton.disabled = false;
      appendAuthMessage(this.authStatus, '🔄 Authentication restored from previous session', false);
      
      // Verify the token is still valid
      this.verifyTokenPermissions();
    }
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    this.authButton.addEventListener('click', () => this.startAuthentication());
    this.logoutButton.addEventListener('click', () => this.logOut());
    
    // Listen for OAuth callback messages
    window.addEventListener('message', (event) => this.handleOAuthMessage(event));
  }

  /**
   * Handle OAuth callback messages from popup window
   */
  handleOAuthMessage(event) {
    console.log('Received message:', event);
    console.log('Message origin:', event.origin);
    console.log('Expected origin:', CONFIG.PROXY_BASE_URL);
    console.log('Message data:', event.data);
    
    // Verify origin for security (but be more lenient for Azure)
    const expectedDomain = new URL(CONFIG.PROXY_BASE_URL).hostname;
    const actualDomain = new URL(event.origin).hostname;
    
    if (actualDomain !== expectedDomain) {
      console.warn('Message from unexpected origin, ignoring');
      console.warn('Expected domain:', expectedDomain, 'Actual domain:', actualDomain);
      return;
    }

    if (event.data.type === 'GITHUB_OAUTH_SUCCESS') {
      console.log('OAuth success message received');
      const token = event.data.access_token;
      appendAuthMessage(this.authStatus, '✅ Received access token from popup', false);
      this.handleAuthenticationSuccess(token);
    } else if (event.data.type === 'GITHUB_OAUTH_ERROR') {
      console.log('OAuth error message received');
      appendAuthMessage(this.authStatus, `❌ Authentication failed: ${event.data.error}`, true);
      this.authButton.disabled = false;
      this.authButton.textContent = 'Authenticate with GitHub';
    } else {
      console.log('Unknown message type:', event.data.type);
    }
  }

  /**
   * Start the GitHub OAuth flow via proxy
   */
  startAuthentication() {
    // Prevent multiple clicks
    if (this.authButton.disabled) {
      return;
    }
    
    // Clear previous status
    this.authStatus.innerHTML = '';
    this.authStatus.className = '';

    // Update button state
    this.authButton.disabled = true;
    this.authButton.textContent = 'Opening GitHub...';
    this.authenticationInProgress = true;

    appendAuthMessage(this.authStatus, '🔄 Initiating GitHub OAuth flow...', false);
    
    // Open OAuth popup
    const oauthUrl = `${CONFIG.PROXY_BASE_URL}/oauth/authorize`;
    const popup = window.open(
      oauthUrl, 
      'github_oauth', 
      CONFIG.OAUTH.POPUP_FEATURES
    );
    
    if (!popup) {
      appendAuthMessage(this.authStatus, '❌ Popup blocked! Please allow popups and try again.', true);
      this.authButton.disabled = false;
      this.authButton.textContent = 'Authenticate with GitHub';
      return;
    }

    appendAuthMessage(this.authStatus, '🔄 Complete authentication in the popup window...', false);
    
    // Check if popup was closed without completing authentication
    const checkClosed = setInterval(() => {
      if (popup.closed && this.authenticationInProgress) {
        clearInterval(checkClosed);
        appendAuthMessage(this.authStatus, '⚠️ Authentication window was closed', false);
        this.authButton.disabled = false;
        this.authButton.textContent = 'Authenticate with GitHub';
        this.authenticationInProgress = false;
      }
    }, 1000);
  }

  /**
   * Handle successful authentication
   */
  handleAuthenticationSuccess(token) {
    console.log('🎉 Authentication successful, storing token');
    
    // Clear authentication state
    this.authenticationInProgress = false;
    
    // Store the access token
    this.accessToken = token;
    localStorage.setItem('github_token', this.accessToken);
    
    // Update UI
    this.authButton.disabled = false;
    this.authButton.textContent = 'Re-Authenticate with GitHub';
    this.logoutButton.style.display = 'block';
    this.workflowButton.disabled = false;
    
    // Clear previous messages and show success
    this.authStatus.innerHTML = '';
    appendAuthMessage(this.authStatus, '🎉 Authentication successful! You can now trigger workflows.', false);
    this.authStatus.className = 'status-success';
    
    // Verify token permissions
    this.verifyTokenPermissions();
  }

  /**
   * Log out by removing the stored token
   */
  logOut() {
    localStorage.removeItem('github_token');
    this.accessToken = '';
    
    // Reset UI
    this.authButton.textContent = 'Authenticate with GitHub';
    this.logoutButton.style.display = 'none';
    this.workflowButton.disabled = true;
    
    // Clear status
    this.authStatus.innerHTML = '';
    this.authStatus.className = '';
    appendAuthMessage(this.authStatus, '✅ Logged out successfully', false);
  }

  /**
   * Verify that the token has the required permissions
   */
  async verifyTokenPermissions() {
    try {
      // Check if the token is valid by getting user info via proxy
      const userResponse = await fetch(`${CONFIG.PROXY_BASE_URL}/api/user`, {
        headers: {
          'Authorization': `token ${this.accessToken}`
        }
      });

      if (!userResponse.ok) {
        throw new Error(`Authentication failed: ${userResponse.status}`);
      }

      const userData = await userResponse.json();
      
      if (userData.login) {
        appendAuthMessage(this.authStatus, `👤 Authenticated as: ${userData.login}`, false);
        
        // Now check if we can access the workflow endpoint
        const workflowResponse = await fetch(`${CONFIG.PROXY_BASE_URL}/api/repos/${CONFIG.GITHUB.REPO_OWNER}/${CONFIG.GITHUB.REPO_NAME}/actions/workflows`, {
          headers: {
            'Authorization': `token ${this.accessToken}`
          }
        });

        if (!workflowResponse.ok) {
          if (workflowResponse.status === 403) {
            throw new Error('Your token does not have the workflow permission. Please re-authenticate.');
          }
          throw new Error(`Failed to access workflows: ${workflowResponse.status}`);
        }

        await workflowResponse.json();
        appendAuthMessage(this.authStatus, '✅ Token verified with workflow access permissions.', false);
      } else {
        throw new Error('Could not retrieve user information');
      }
    } catch (error) {
      console.error('Error verifying token:', error);
      appendAuthMessage(this.authStatus, `❌ Error: ${error.message}`, true);
      
      if (error.message.includes('401') || error.message.includes('403')) {
        // Reset authentication state on error
        this.accessToken = '';
        localStorage.removeItem('github_token');
        
        // Update UI to allow re-authentication
        this.authButton.disabled = false;
        this.authButton.textContent = 'Authenticate with GitHub';
        this.logoutButton.style.display = 'none';
        this.workflowButton.disabled = true;
      }
    }
  }

  /**
   * Get the current access token
   */
  getAccessToken() {
    return this.accessToken;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.accessToken;
  }
}
