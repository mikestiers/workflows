// Workflow management module
import { CONFIG } from './config.js';
import { appendLog, updateButtonState, updateStatus, displayWorkflowSummary } from './ui.js';

export class WorkflowManager {
  constructor(authManager) {
    this.authManager = authManager;
    
    // DOM elements
    this.workflowButton = null;
    this.workflowStatus = null;
    this.workflowLogs = null;
  }

  /**
   * Initialize the workflow manager with DOM elements
   */
  init(workflowButton, workflowStatus, workflowLogs) {
    this.workflowButton = workflowButton;
    this.workflowStatus = workflowStatus;
    this.workflowLogs = workflowLogs;

    // Set up event listeners
    this.workflowButton.addEventListener('click', () => this.triggerWorkflow());
  }

  /**
   * Trigger the GitHub workflow via proxy
   */
  async triggerWorkflow() {
    // Check if we have a token
    if (!this.authManager.isAuthenticated()) {
      appendLog(this.workflowLogs, 'Error: No authentication token available', true);
      return;
    }
    
    // Prevent multiple clicks
    if (this.workflowButton.classList.contains('running')) {
      return;
    }
    
    // Reset UI state
    this.resetWorkflowUI();
    
    // Update button state to "running"
    updateButtonState(this.workflowButton, 'running', 'Running Workflow...');
    
    // Show status with running indicator
    updateStatus(this.workflowStatus, 'running', 'Workflow in progress. Please wait...');
    
    // Show logs panel
    this.workflowLogs.classList.add('show');
    this.workflowLogs.innerHTML = '';
    
    // Log initial action
    appendLog(this.workflowLogs, 'Attempting to trigger GitHub workflow: ' + CONFIG.GITHUB.WORKFLOW_ID);
    appendLog(this.workflowLogs, `Repository: ${CONFIG.GITHUB.REPO_OWNER}/${CONFIG.GITHUB.REPO_NAME}`);
    
    try {
      // Call GitHub API via proxy to trigger the workflow
      const result = await this.triggerGitHubWorkflow();
      
      if (result.success) {
        this.handleWorkflowStarted(result);
        
        // Poll for workflow completion
        if (result.runId) {
          this.pollWorkflowStatus(result.runId);
        }
      } else {
        this.handleWorkflowFailed(result.error);
      }
    } catch (error) {
      this.handleWorkflowFailed(error.message || 'Failed to trigger workflow');
    }
  }

  /**
   * Reset the workflow UI to initial state
   */
  resetWorkflowUI() {
    // Clear previous state classes
    this.workflowButton.classList.remove('success', 'failed');
    this.workflowStatus.classList.remove('status-success', 'status-failed');
    this.workflowStatus.innerHTML = '';
  }

  /**
   * Trigger the GitHub workflow via proxy API
   */
  async triggerGitHubWorkflow() {
    try {
      appendLog(this.workflowLogs, 'Dispatching workflow run request via proxy');
      
      // Make the API call via proxy to trigger the workflow
      const response = await fetch(`${CONFIG.PROXY_BASE_URL}/api/repos/${CONFIG.GITHUB.REPO_OWNER}/${CONFIG.GITHUB.REPO_NAME}/actions/workflows/${CONFIG.GITHUB.WORKFLOW_ID}/dispatches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `token ${this.authManager.getAccessToken()}`
        },
        body: JSON.stringify({
          ref: 'main', // or whatever branch you want to run the workflow on
          inputs: {} // Any input parameters your workflow accepts
        })
      });
      
      if (response.status === 204 || response.ok) {
        appendLog(this.workflowLogs, 'Workflow dispatch received by GitHub');
        
        // Get the run ID by querying recent workflow runs
        const runsResponse = await fetch(`${CONFIG.PROXY_BASE_URL}/api/repos/${CONFIG.GITHUB.REPO_OWNER}/${CONFIG.GITHUB.REPO_NAME}/actions/workflows/${CONFIG.GITHUB.WORKFLOW_ID}/runs?per_page=1`, {
          headers: {
            'Authorization': `token ${this.authManager.getAccessToken()}`
          }
        });
        
        if (!runsResponse.ok) {
          throw new Error(`GitHub API returned ${runsResponse.status}: ${await runsResponse.text()}`);
        }
        
        const runsData = await runsResponse.json();
        if (runsData.workflow_runs && runsData.workflow_runs.length > 0) {
          const runId = runsData.workflow_runs[0].id;
          appendLog(this.workflowLogs, `Workflow run ID: ${runId}`);
          return {
            success: true,
            runId: runId,
            url: runsData.workflow_runs[0].html_url
          };
        }
        
        // If we couldn't get the run ID, still return success
        appendLog(this.workflowLogs, 'Workflow triggered, but could not retrieve run ID');
        return { 
          success: true,
          url: `https://github.com/${CONFIG.GITHUB.REPO_OWNER}/${CONFIG.GITHUB.REPO_NAME}/actions`
        };
      } else {
        let errorMessage = `GitHub API returned status ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          // Ignore JSON parsing errors
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Error triggering workflow:', error);
      
      let errorMessage = error.message || 'Failed to trigger workflow';
      
      // Handle token expiration
      if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
        localStorage.removeItem('github_token');
        this.workflowButton.disabled = true;
        errorMessage = 'Authentication expired or invalid. Please re-authenticate.';
      }
      
      return { 
        success: false, 
        error: errorMessage
      };
    }
  }

  /**
   * Handle successful workflow start
   */
  handleWorkflowStarted(data) {
    appendLog(this.workflowLogs, 'Workflow run started successfully');
    
    if (data.runId) {
      appendLog(this.workflowLogs, `Run ID: ${data.runId}`);
    }
    
    if (data.url) {
      const runUrl = data.url;
      appendLog(this.workflowLogs, `View run at: ${runUrl}`);
      
      // Add a link to the workflow run
      const linkContainer = document.createElement('div');
      linkContainer.style.marginTop = '10px';
      
      const link = document.createElement('a');
      link.href = runUrl;
      link.target = '_blank';
      link.textContent = 'Open Workflow Run';
      link.style.color = '#2196F3';
      
      linkContainer.appendChild(link);
      this.workflowStatus.appendChild(linkContainer);
    }
  }

  /**
   * Poll for workflow completion via proxy
   */
  pollWorkflowStatus(runId) {
    appendLog(this.workflowLogs, 'Checking workflow status...');
    
    // If we don't have a run ID, we can't poll for status
    if (!runId) {
      appendLog(this.workflowLogs, 'No run ID available, cannot poll for status');
      appendLog(this.workflowLogs, 'Please check GitHub Actions directly for workflow status');
      
      updateButtonState(this.workflowButton, 'normal', 'Get Azure Resource Groups');
      this.workflowStatus.classList.remove('status-running');
      return;
    }
    
    let pollCount = 0;
    
    // Function to check workflow status
    const checkStatus = async () => {
      try {
        const response = await fetch(`${CONFIG.PROXY_BASE_URL}/api/repos/${CONFIG.GITHUB.REPO_OWNER}/${CONFIG.GITHUB.REPO_NAME}/actions/runs/${runId}`, {
          headers: {
            'Authorization': `token ${this.authManager.getAccessToken()}`
          }
        });

        if (!response.ok) {
          throw new Error(`GitHub API returned ${response.status}`);
        }

        const data = await response.json();
        const status = data.status; // queued, in_progress, completed
        const conclusion = data.conclusion; // success, failure, cancelled, etc.
        
        appendLog(this.workflowLogs, `Current status: ${status}${conclusion ? ', conclusion: ' + conclusion : ''}`);
        
        if (status === 'completed') {
          // Workflow has finished
          const success = conclusion === 'success';

          if (success) {
            this.handleWorkflowSuccess(runId);
          } else {
            this.handleWorkflowFailure(conclusion);
          }
          
          // Workflow is complete, no need to poll again
          return;
        } else if (pollCount >= CONFIG.POLLING.MAX_POLLS) {
          // We've polled too many times, stop polling
          appendLog(this.workflowLogs, 'Exceeded maximum polling attempts. Please check GitHub directly for status.', true);
          
          // Reset button
          updateButtonState(this.workflowButton, 'normal', 'Get Azure Resource Groups');
          return;
        }
        
        // Continue polling
        pollCount++;
        setTimeout(checkStatus, CONFIG.POLLING.POLL_INTERVAL);
      } catch (error) {
        appendLog(this.workflowLogs, `Error checking workflow status: ${error.message}`, true);
        
        // On error, stop polling and reset the button
        updateButtonState(this.workflowButton, 'normal', 'Get Azure Resource Groups');
      }
    };
    
    // Start polling
    checkStatus();
  }

  /**
   * Handle successful workflow completion
   */
  handleWorkflowSuccess(runId) {
    // Update to success state
    appendLog(this.workflowLogs, 'Workflow completed successfully!');
    
    updateButtonState(this.workflowButton, 'success', 'Workflow Completed');
    updateStatus(this.workflowStatus, 'success', 'Workflow completed successfully!');
    
    // Fetch and display resource group data
    this.fetchResourceGroupResults(runId);
    
    // Reset button after 5 seconds
    setTimeout(() => {
      updateButtonState(this.workflowButton, 'normal', 'Get Azure Resource Groups');
    }, 5000);
  }

  /**
   * Handle workflow failure
   */
  handleWorkflowFailure(conclusion) {
    // Update to failure state
    appendLog(this.workflowLogs, `Workflow failed with conclusion: ${conclusion}`, true);
    
    updateButtonState(this.workflowButton, 'failed', 'Workflow Failed');
    updateStatus(this.workflowStatus, 'failed', `Workflow failed with conclusion: ${conclusion}`);
    
    // Reset button after 5 seconds
    setTimeout(() => {
      updateButtonState(this.workflowButton, 'normal', 'Get Azure Resource Groups');
    }, 5000);
  }

  /**
   * Handle workflow trigger failure
   */
  handleWorkflowFailed(errorMessage) {
    appendLog(this.workflowLogs, `Error: ${errorMessage}`, true);
    
    updateButtonState(this.workflowButton, 'failed', 'Workflow Failed');
    updateStatus(this.workflowStatus, 'failed', `Failed to trigger workflow: ${errorMessage}`);
    
    // Reset button after 5 seconds
    setTimeout(() => {
      updateButtonState(this.workflowButton, 'normal', 'Get Azure Resource Groups');
      this.workflowStatus.classList.remove('status-failed');
      this.workflowStatus.innerHTML = '';
    }, 5000);
  }

  /**
   * Fetch resource group results from the completed workflow
   */
  async fetchResourceGroupResults(runId) {
    try {
      appendLog(this.workflowLogs, '🔍 Fetching workflow summary...');
      
      // Get workflow run summary
      const runResponse = await fetch(`${CONFIG.PROXY_BASE_URL}/api/repos/${CONFIG.GITHUB.REPO_OWNER}/${CONFIG.GITHUB.REPO_NAME}/actions/runs/${runId}`, {
        headers: {
          'Authorization': `token ${this.authManager.getAccessToken()}`
        }
      });
      
      if (!runResponse.ok) {
        throw new Error(`Failed to fetch workflow summary: ${runResponse.status}`);
      }
      
      const workflowSummary = await runResponse.json();
      appendLog(this.workflowLogs, '✅ Successfully retrieved workflow summary');
      
      // Display the JSON summary
      displayWorkflowSummary(workflowSummary);
      appendLog(this.workflowLogs, '✅ Workflow summary displayed successfully');
      
    } catch (error) {
      console.error('Error fetching workflow summary:', error);
      appendLog(this.workflowLogs, `❌ Error fetching workflow summary: ${error.message}`, true);
    }
  }
}
