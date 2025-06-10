// Main application initialization
import { AuthManager } from './auth.js';
import { WorkflowManager } from './workflow.js';

/**
 * Initialize the GitHub Workflow OAuth Proxy application
 */
document.addEventListener('DOMContentLoaded', function() {
  // Cache DOM elements
  const authButton = document.getElementById('auth-button');
  const logoutButton = document.getElementById('logout-button');
  const authStatus = document.getElementById('auth-status');
  
  const workflowButton = document.getElementById('workflow-trigger');
  const workflowStatus = document.getElementById('workflow-status');
  const workflowLogs = document.getElementById('workflow-logs');
  
  // Initialize managers
  const authManager = new AuthManager();
  const workflowManager = new WorkflowManager(authManager);
  
  // Initialize both managers with their respective DOM elements
  authManager.init(authButton, logoutButton, authStatus, workflowButton);
  workflowManager.init(workflowButton, workflowStatus, workflowLogs);
  
  console.log('GitHub Workflow OAuth Proxy application initialized');
});
