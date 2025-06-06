// Configuration map for field dependencies and relationships
const formConfig = {
  "environments": {
    "DEV": {
      "subscription": {
        "options": ["Sub1"],
        "default": "Sub1"
      },
      "sqlServer": {
        "options": ["SQL11"],
        "default": "SQL11"
      }
    },
    "UAT": {
      "subscription": {
        "options": ["Sub2"],
        "default": "Sub2"
      },
      "sqlServer": {
        "options": ["SQL22", "SQL33"],
        "default": "SQL22"
      }
    },
    "PRD": {
      "subscription": {
        "options": ["Sub3", "Sub4"],
        "default": "Sub3"
      },
      "subscriptions": {
        "Sub3": {
          "sqlServer": {
            "options": ["SQL34", "SQL35"],
            "default": "SQL34"
          }
        },
        "Sub4": {
          "sqlServer": {
            "options": ["SQL35"],
            "default": "SQL35"
          }
        }
      }
    }
  }
};

document.addEventListener('DOMContentLoaded', function() {
  // Cache DOM elements
  const form = document.getElementById('dynamicForm');
  const environmentSelect = createSelect('environment', 'Environment', 'Select your environment', 
    Object.keys(formConfig.environments));
  const subscriptionSelect = createSelect('subscription', 'Subscription', 'Select environment first');
  const sqlServerSelect = createSelect('sqlServer', 'SQL Server', 'Select subscription first');
    // Setup event listeners
  environmentSelect.addEventListener('change', function() { updateDependentDropdowns('environment'); });
  subscriptionSelect.addEventListener('change', function() { updateDependentDropdowns('subscription'); });
  form.addEventListener('submit', validateAndSubmit);
  
  // Initialize form
  setupForm();
  
  /**
   * Create a select element with label and options
   */
  function createSelect(id, label, placeholder, options = []) {
    const wrapper = document.createElement('div');
    
    // Create label
    const labelElement = document.createElement('label');
    labelElement.textContent = label;
    labelElement.htmlFor = id;
    
    // Create select
    const select = document.createElement('select');
    select.id = id;
    select.name = id;
    select.setAttribute('aria-label', label);
    
    // Add placeholder option
    const placeholderOption = document.createElement('option');
    placeholderOption.value = "";
    placeholderOption.textContent = placeholder;
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    select.appendChild(placeholderOption);
    
    // Add options if provided
    if (options.length > 0) {
      options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        select.appendChild(option);
      });
    }
    
    // Append to wrapper
    wrapper.appendChild(labelElement);
    wrapper.appendChild(select);
    form.appendChild(wrapper);
    
    return select;
  }
  
  /**
   * Setup initial form with submit button
   */
  function setupForm() {
    // Add submit button
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.textContent = 'Submit';
    form.appendChild(submitButton);
  }
  /**
   * Update dependent dropdowns based on which dropdown changed
   * @param {string} changedDropdown - The dropdown that triggered the update ('environment' or 'subscription')
   */
  function updateDependentDropdowns(changedDropdown) {
    const environment = environmentSelect.value;
    const subscription = subscriptionSelect.value;
    
    // If environment changed, update subscription options first
    if (changedDropdown === 'environment') {
      if (environment) {
        // Get subscription options for the selected environment
        const envConfig = formConfig.environments[environment];
        populateSelect(
          subscriptionSelect, 
          envConfig.subscription.options,
          envConfig.subscription.default
        );
      } else {
        // Clear subscription if no environment selected
        populateSelect(subscriptionSelect, [], null);
      }
    }
    
    // Update SQL server options based on current environment and subscription
    let sqlOptions = [];
    let sqlDefaultValue = null;
    
    if (environment && subscription) {
      const envConfig = formConfig.environments[environment];
      
      // Check if this environment has subscription-specific SQL servers
      if (envConfig.subscriptions && envConfig.subscriptions[subscription]) {
        // Use subscription-specific SQL servers (PRD environment case)
        const subscriptionConfig = envConfig.subscriptions[subscription];
        sqlOptions = subscriptionConfig.sqlServer.options;
        sqlDefaultValue = subscriptionConfig.sqlServer.default;
      } else if (envConfig.sqlServer) {
        // Use environment-level SQL servers (DEV/UAT case)
        sqlOptions = envConfig.sqlServer.options;
        sqlDefaultValue = envConfig.sqlServer.default;
      }
    }
    
    // Update SQL server dropdown with appropriate options
    populateSelect(sqlServerSelect, sqlOptions, sqlDefaultValue);
  }
  
  /**
   * Populate a select element with options
   */
  function populateSelect(select, options, defaultValue) {
    // Save the placeholder option
    const placeholder = select.options[0];
    
    // Clear all options
    select.innerHTML = '';
    
    // Add back the placeholder
    select.appendChild(placeholder);
    
    if (options.length === 0) {
      placeholder.selected = true;
      return;
    }
    
    // Add new options
    options.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt;
      option.textContent = opt;
      if (opt === defaultValue) option.selected = true;
      select.appendChild(option);
    });
    
    // If default value is set, select it
    if (defaultValue) select.value = defaultValue;
  }
  
  /**
   * Validate and submit the form
   */
  function validateAndSubmit(event) {
    event.preventDefault();
    
    const environment = environmentSelect.value;
    const subscription = subscriptionSelect.value;
    const sqlServer = sqlServerSelect.value;
    let isValid = true;
    
    // Ensure selections are made
    if (!environment) {
      alert('Please select an environment');
      isValid = false;
    } else if (!subscription) {
      alert('Please select a subscription');
      isValid = false;
    } else if (!sqlServer) {
      alert('Please select a SQL server');
      isValid = false;
    }
    
    // Validate against config
    if (isValid) {
      const envConfig = formConfig.environments[environment];
      
      // Validate subscription
      if (!envConfig.subscription.options.includes(subscription)) {
        alert(`${environment} environment can only use subscriptions: ${envConfig.subscription.options.join(', ')}`);
        isValid = false;
      }
      
      // Validate SQL Server
      let validSqlServers = [];
      if (envConfig.subscriptions && envConfig.subscriptions[subscription]) {
        validSqlServers = envConfig.subscriptions[subscription].sqlServer.options;
      } else {
        validSqlServers = envConfig.sqlServer.options;
      }
      
      if (!validSqlServers.includes(sqlServer)) {
        alert(`For ${environment} with ${subscription}, allowed SQL servers are: ${validSqlServers.join(', ')}`);
        isValid = false;
      }
    }
    
    if (isValid) {
      alert('Form submitted successfully!');
      // Form would be submitted here in a real application
    }
  }
});
