// UI utilities and logging functions

/**
 * Append an authentication message to the auth status element
 */
export function appendAuthMessage(authStatus, message, isError) {
  const messageEl = document.createElement('div');
  messageEl.textContent = message;
  messageEl.style.padding = '5px 0';
  messageEl.style.lineHeight = '1.4';
  
  if (isError) {
    messageEl.style.color = '#F44336';
    messageEl.style.fontWeight = 'bold';
  } else if (message.includes('✅') || message.includes('🎉')) {
    messageEl.style.color = '#28a745';
    messageEl.style.fontWeight = 'bold';
  } else if (message.includes('🔄') || message.includes('⏳')) {
    messageEl.style.color = '#FFC107';
  }
  
  authStatus.appendChild(messageEl);
}

/**
 * Append a log entry with timestamp to the logs panel
 */
export function appendLog(workflowLogs, message, isError = false) {
  const now = new Date();
  const timestamp = now.toLocaleTimeString();
  
  const logEntry = document.createElement('div');
  logEntry.className = 'log-entry';
  
  const timeSpan = document.createElement('span');
  timeSpan.className = 'timestamp';
  timeSpan.textContent = `[${timestamp}] `;
  
  logEntry.appendChild(timeSpan);
  
  const messageText = document.createTextNode(message);
  logEntry.appendChild(messageText);
  
  if (isError) {
    logEntry.style.color = '#FF8A80';
  }
  
  workflowLogs.appendChild(logEntry);
  workflowLogs.scrollTop = workflowLogs.scrollHeight;
}

/**
 * Update button state and styling
 */
export function updateButtonState(button, state, text) {
  // Remove all state classes
  button.classList.remove('running', 'success', 'failed');
  
  switch (state) {
    case 'running':
      button.classList.add('running');
      button.disabled = true;
      break;
    case 'success':
      button.classList.add('success');
      button.disabled = false;
      break;
    case 'failed':
      button.classList.add('failed');
      button.disabled = false;
      break;
    case 'normal':
    default:
      button.disabled = false;
      break;
  }
  
  if (text) {
    button.textContent = text;
  }
}

/**
 * Update status element with appropriate styling
 */
export function updateStatus(statusElement, state, message) {
  // Remove all state classes
  statusElement.classList.remove('status-running', 'status-success', 'status-failed');
  
  // Clear existing content
  statusElement.innerHTML = '';
  
  if (message) {
    const statusText = document.createElement('div');
    statusText.textContent = message;
    statusElement.appendChild(statusText);
  }
  
  switch (state) {
    case 'running':
      statusElement.classList.add('status-running');
      break;
    case 'success':
      statusElement.classList.add('status-success');
      break;
    case 'failed':
      statusElement.classList.add('status-failed');
      break;
  }
}

/**
 * Display workflow summary results
 */
export function displayWorkflowSummary(workflowSummary) {
  // Show the results section
  const resultsSection = document.getElementById('resource-group-results');
  resultsSection.style.display = 'block';
  
  // Update the section title
  const resultsTitle = resultsSection.querySelector('h2');
  resultsTitle.textContent = '📋 Workflow Summary';
  
  // Clear previous content
  const countElement = document.getElementById('resource-group-count');
  countElement.innerHTML = '<h3>Workflow Run Summary</h3>';
  
  const listElement = document.getElementById('resource-group-list');
  listElement.innerHTML = `
    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0;">
      <p><strong>Status:</strong> ${workflowSummary.status || 'Unknown'}</p>
      <p><strong>Conclusion:</strong> ${workflowSummary.conclusion || 'Unknown'}</p>
      <p><strong>Workflow:</strong> ${workflowSummary.name || 'Unknown'}</p>
      <p><strong>Run Number:</strong> ${workflowSummary.run_number || 'Unknown'}</p>
      <p><strong>Created:</strong> ${workflowSummary.created_at ? new Date(workflowSummary.created_at).toLocaleString() : 'Unknown'}</p>
      <p><strong>Updated:</strong> ${workflowSummary.updated_at ? new Date(workflowSummary.updated_at).toLocaleString() : 'Unknown'}</p>
    </div>
  `;
  
  // Display the complete JSON
  const jsonElement = document.getElementById('resource-group-json');
  jsonElement.textContent = JSON.stringify(workflowSummary, null, 2);
  
  // Scroll to results
  resultsSection.scrollIntoView({ behavior: 'smooth' });
}
