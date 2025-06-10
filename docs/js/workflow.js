// Workflow management module
import { CONFIG } from './config.js';
import { appendLog, updateButtonState, updateStatus } from './ui.js';

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
      appendLog(this.workflowLogs, '🔍 Fetching workflow artifacts...');
      
      // Get workflow artifacts
      const artifactsResponse = await fetch(`${CONFIG.PROXY_BASE_URL}/api/repos/${CONFIG.GITHUB.REPO_OWNER}/${CONFIG.GITHUB.REPO_NAME}/actions/runs/${runId}/artifacts`, {
        headers: {
          'Authorization': `token ${this.authManager.getAccessToken()}`
        }
      });
      
      if (!artifactsResponse.ok) {
        throw new Error(`Failed to fetch workflow artifacts: ${artifactsResponse.status}`);
      }
      
      const artifactsData = await artifactsResponse.json();
      
      if (!artifactsData.artifacts || artifactsData.artifacts.length === 0) {
        appendLog(this.workflowLogs, '⚠️ No artifacts found for this workflow run');
        return;
      }
      
      appendLog(this.workflowLogs, `📦 Found ${artifactsData.artifacts.length} artifact(s)`);
      
      // Find the resource groups artifact (assuming it's named "resource-groups" or similar)
      const artifact = artifactsData.artifacts.find(a => 
        a.name.toLowerCase().includes('resource') || 
        a.name.toLowerCase().includes('output') ||
        a.name.toLowerCase().includes('result')
      ) || artifactsData.artifacts[0]; // fallback to first artifact
      
      appendLog(this.workflowLogs, `📂 Downloading artifact: ${artifact.name}`);
      
      // Download the artifact
      const downloadResponse = await fetch(`${CONFIG.PROXY_BASE_URL}/api/repos/${CONFIG.GITHUB.REPO_OWNER}/${CONFIG.GITHUB.REPO_NAME}/actions/artifacts/${artifact.id}/zip`, {
        headers: {
          'Authorization': `token ${this.authManager.getAccessToken()}`
        }
      });
      
      if (!downloadResponse.ok) {
        throw new Error(`Failed to download artifact: ${downloadResponse.status}`);
      }
      
      // Get the artifact as a blob
      const artifactBlob = await downloadResponse.blob();
      appendLog(this.workflowLogs, '🔧 Extracting artifact contents...');
      
      // Extract and process the artifact
      await this.extractAndDisplayArtifact(artifactBlob);
      
    } catch (error) {
      console.error('Error fetching workflow artifacts:', error);
      appendLog(this.workflowLogs, `❌ Error fetching workflow artifacts: ${error.message}`, true);
    }
  }

  /**
   * Extract and display the contents of a GitHub artifact (ZIP file)
   */
  async extractAndDisplayArtifact(artifactBlob) {
    try {
      // Load JSZip dynamically
      if (!window.JSZip) {
        appendLog(this.workflowLogs, '📥 Loading ZIP extraction library...');
        await this.loadJSZip();
      }
      
      // Create JSZip instance and load the blob
      const zip = new JSZip();
      const zipContents = await zip.loadAsync(artifactBlob);
      
      appendLog(this.workflowLogs, '📁 Artifact extracted successfully');
      
      // Look for JSON files in the artifact
      const jsonFiles = Object.keys(zipContents.files).filter(filename => 
        filename.toLowerCase().endsWith('.json')
      );
      
      if (jsonFiles.length === 0) {
        // Look for any text files
        const textFiles = Object.keys(zipContents.files).filter(filename => 
          filename.toLowerCase().endsWith('.txt') || 
          filename.toLowerCase().endsWith('.log') ||
          !filename.includes('.')
        );
        
        if (textFiles.length > 0) {
          const file = zipContents.files[textFiles[0]];
          const content = await file.async('text');
          this.displayArtifactContent(textFiles[0], content);
        } else {
          appendLog(this.workflowLogs, '⚠️ No JSON or text files found in artifact');
        }
        return;
      }
      
      // Process the first JSON file found
      const jsonFileName = jsonFiles[0];
      const jsonFile = zipContents.files[jsonFileName];
      const jsonContent = await jsonFile.async('text');
      
      appendLog(this.workflowLogs, `📄 Processing file: ${jsonFileName}`);
      
      try {
        const parsedData = JSON.parse(jsonContent);
        this.displayResourceGroupData(parsedData);
        appendLog(this.workflowLogs, '✅ Resource group data displayed successfully');
      } catch (parseError) {
        // If it's not valid JSON, display as text
        this.displayArtifactContent(jsonFileName, jsonContent);
        appendLog(this.workflowLogs, '✅ Artifact content displayed as text');
      }
      
    } catch (error) {
      console.error('Error extracting artifact:', error);
      appendLog(this.workflowLogs, `❌ Error extracting artifact: ${error.message}`, true);
    }
  }

  /**
   * Load JSZip library dynamically
   */
  async loadJSZip() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  /**
   * Display resource group data in the UI
   */
  displayResourceGroupData(data) {
    const resultsSection = document.getElementById('resource-group-results');
    const countDiv = document.getElementById('resource-group-count');
    const listDiv = document.getElementById('resource-group-list');
    const jsonDiv = document.getElementById('resource-group-json');
    
    // Show the results section
    resultsSection.style.display = 'block';
    
    // Handle different data structures
    let resourceGroups = [];
    let displayData = data;
    
    if (Array.isArray(data)) {
      resourceGroups = data;
    } else if (data.value && Array.isArray(data.value)) {
      // Azure REST API format
      resourceGroups = data.value;
    } else if (data.resourceGroups && Array.isArray(data.resourceGroups)) {
      resourceGroups = data.resourceGroups;
    } else if (typeof data === 'object') {
      // If it's an object but not the expected format, still try to display it
      resourceGroups = [];
      displayData = data;
    }
    
    // Display count
    if (resourceGroups.length > 0) {
      countDiv.innerHTML = `<strong>Found ${resourceGroups.length} resource group(s)</strong>`;
      
      // Create a nice list of resource groups
      const listHtml = resourceGroups.map(rg => {
        const name = rg.name || rg.resourceGroupName || 'Unknown';
        const location = rg.location || rg.region || 'Unknown';
        const tags = rg.tags ? Object.keys(rg.tags).length : 0;
        
        return `
          <div style="border: 1px solid #ddd; padding: 10px; margin: 5px 0; border-radius: 4px; background-color: #f9f9f9;">
            <strong>📦 ${name}</strong><br>
            <span style="color: #666;">📍 Location: ${location}</span><br>
            ${tags > 0 ? `<span style="color: #666;">🏷️ Tags: ${tags}</span>` : ''}
          </div>
        `;
      }).join('');
      
      listDiv.innerHTML = listHtml;
    } else {
      countDiv.innerHTML = `<strong>Resource group data received</strong>`;
      listDiv.innerHTML = '<div style="color: #666;">Raw data structure - see JSON below</div>';
    }
    
    // Display raw JSON
    jsonDiv.textContent = JSON.stringify(displayData, null, 2);
  }

  /**
   * Display generic artifact content
   */
  displayArtifactContent(filename, content) {
    const resultsSection = document.getElementById('resource-group-results');
    const countDiv = document.getElementById('resource-group-count');
    const listDiv = document.getElementById('resource-group-list');
    const jsonDiv = document.getElementById('resource-group-json');
    
    // Show the results section
    resultsSection.style.display = 'block';
    
    // Update labels
    const title = resultsSection.querySelector('h2');
    title.textContent = `📄 Workflow Output: ${filename}`;
    
    countDiv.innerHTML = `<strong>File: ${filename}</strong>`;
    listDiv.innerHTML = '<div style="color: #666;">Content displayed below</div>';
    
    // Display content
    jsonDiv.textContent = content;
  }
}
