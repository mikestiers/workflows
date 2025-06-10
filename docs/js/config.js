// Configuration constants for GitHub Workflow OAuth Proxy
export const CONFIG = {
  PROXY_BASE_URL: 'https://github-oauth-proxy-2025.azurewebsites.net',
  GITHUB: {
    REPO_OWNER: 'mikestiers',
    REPO_NAME: 'workflows',
    WORKFLOW_ID: 'GetResourceGroups.yml'
  },
  POLLING: {
    MAX_POLLS: 30, // Maximum number of status checks (with 2s delay = 1 minute max)
    POLL_INTERVAL: 2000 // Poll every 2 seconds
  },
  OAUTH: {
    POPUP_FEATURES: 'width=600,height=700,scrollbars=yes,resizable=yes'
  }
};
