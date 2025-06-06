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

// Base schema for form UI generation
const schema = {
    "title": "User Preferences",
    "type": "object",
    "properties": {
        "environment": {
            "type": "string",
            "title": "Environment",
            "enum": ["DEV", "UAT", "PRD"],
            "default": "DEV",
            "description": "Select your environment"
        },
        "subscription": {
            "type": "string",
            "title": "Subscription",
            "description": "Select your subscription"
            // No enum or default - will be set dynamically based on environment
        },
        "sqlServer": {
            "type": "string",
            "title": "SQL Server",
            "description": "Select SQL Server instance"
            // No enum or default - will be set dynamically based on environment and subscription
        }
    }
};

// Helper function to get configuration for a specific environment
function getConfigForEnvironment(environment) {
    return formConfig.environments[environment] || null;
}

// Helper function to get configuration for a specific environment and subscription
function getConfigForEnvironmentAndSubscription(environment, subscription) {
    const envConfig = getConfigForEnvironment(environment);

    if (!envConfig) {
        return null;
    }

    // For environments with subscription-specific configurations (like PRD)
    if (envConfig.subscriptions && envConfig.subscriptions[subscription]) {
        // Return merged configuration (environment defaults + subscription specifics)
        return {
            ...envConfig,
            ...envConfig.subscriptions[subscription]
        };
    }

    // If no specific subscription config found, return just the environment config
    return envConfig;
}

function createForm(schema) {
    const form = document.getElementById('dynamicForm');
    const fields = schema.properties;

    for (const key in fields) {
        const field = fields[key];
        const wrapper = document.createElement('div');
        wrapper.id = `wrapper-${key}`;

        const label = document.createElement('label');
        label.textContent = field.title;
        if (field.description) label.title = field.description; let input;
        if (field.enum) {
            input = document.createElement('select');
            field.enum.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                if (opt === field.default) option.selected = true;
                input.appendChild(option);
            });
        } else if (key === "subscription" || key === "sqlServer") {
            // For dynamic dropdowns, create an empty select that will be populated later
            input = document.createElement('select');
            if (key === "subscription") {
                // Add a placeholder option
                const placeholderOption = document.createElement('option');
                placeholderOption.value = "";
                placeholderOption.textContent = "Select environment first";
                placeholderOption.disabled = true;
                placeholderOption.selected = true;
                input.appendChild(placeholderOption);
            } else if (key === "sqlServer") {
                // Add a placeholder option
                const placeholderOption = document.createElement('option');
                placeholderOption.value = "";
                placeholderOption.textContent = "Select subscription first";
                placeholderOption.disabled = true;
                placeholderOption.selected = true;
                input.appendChild(placeholderOption);
            }
        } else if (field.type === 'boolean') {
            input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = field.default || false;
        } else {
            input = document.createElement('input');
            input.type = 'text';
            input.placeholder = field.placeholder || '';
            input.value = field.default || '';
        }
        input.name = key;
        input.id = key;

        wrapper.appendChild(label);
        wrapper.appendChild(input);        // No error message elements needed

        form.appendChild(wrapper);
    }
    // Add a submit button
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.textContent = 'Submit';
    form.appendChild(submitButton);    // Conditional logic and validation
    const environmentInput = form.querySelector('[name="environment"]');
    const subscriptionInput = form.querySelector('[name="subscription"]');
    const sqlServerInput = form.querySelector('[name="sqlServer"]');

    // Update variable names in the DOM for clarity
    environmentInput.setAttribute('aria-label', 'Environment');
    subscriptionInput.setAttribute('aria-label', 'Subscription');
    sqlServerInput.setAttribute('aria-label', 'SQL Server');
    // Function to update options based on environment
    function updateDropdownOptions(selectElement, propertyName) {
        const environment = environmentInput.value;
        console.log(`Starting updateDropdownOptions for ${propertyName} in environment ${environment}`);

        // Clear existing options
        while (selectElement.firstChild) {
            selectElement.removeChild(selectElement.firstChild);
        }

        // Get configuration for this environment
        const envConfig = getConfigForEnvironment(environment);
        console.log(`Environment config for ${environment}:`, envConfig);

        // Extract options from configuration based on environment
        let options = [];
        let defaultValue = "";

        // If we have a specific config for this property in this environment, use it
        if (envConfig && envConfig[propertyName]) {
            if (envConfig[propertyName].options) {
                options = envConfig[propertyName].options;
                defaultValue = envConfig[propertyName].default || "";
                console.log(`Found options for ${propertyName} in environment config:`, options);
            }
        }
        // Fallback to empty array if no specific options found
        else {
            options = [];
            defaultValue = "";
            console.log(`No options found for ${propertyName} in selected environment`);
        }
        // Add the options to the select element
        options.forEach(optText => {
            const option = document.createElement('option');
            option.value = optText;
            option.textContent = optText;
            selectElement.appendChild(option);
        });

        // Set default value if available
        if (defaultValue) {
            selectElement.value = defaultValue;
            console.log(`Setting default value for ${propertyName}:`, defaultValue);
        }

        console.log(`Finished updating ${propertyName} dropdown. Final value:`, selectElement.value);
        console.log(`Dropdown now has ${selectElement.options.length} options`);
    }    // Function to update SQL Server options based on environment
    function updateSqlServerOptions() {
        console.log("Updating SQL Server options for environment:", environmentInput.value);
        updateDropdownOptions(sqlServerInput, "sqlServer");
        console.log("SQL Server options updated. Current value:", sqlServerInput.value);
    }    // Function to handle environment changes
    function handleEnvironmentChange() {
        const environment = environmentInput.value;

        // Update dropdown options when environment changes
        console.log("Environment changed to:", environment);
        console.log("Updating dependent dropdowns...");
        updateDropdownOptions(subscriptionInput, "subscription"); // Update subscription options directly
        updateSqlServerBasedOnEnvironmentAndSubscription();
    }

    // Add direct environment change listener specifically for SQL Server
    environmentInput.addEventListener('change', function () {
        const environment = environmentInput.value;
        console.log("Direct environment change handler triggered for:", environment);

        updateSqlServerBasedOnEnvironmentAndSubscription();
    });    // Function to update SQL Server options based on both environment and subscription
    function updateSqlServerBasedOnEnvironmentAndSubscription() {
        const environment = environmentInput.value;
        const subscription = subscriptionInput.value;
        console.log("Updating SQL Server options for environment:", environment, "and subscription:", subscription);

        // Get configuration for both environment and subscription
        const combinedConfig = getConfigForEnvironmentAndSubscription(environment, subscription);
        console.log("Combined config for", environment, "and", subscription, ":", combinedConfig);

        const sqlServerSelect = form.querySelector('[name="sqlServer"]');

        // Clear current options
        while (sqlServerSelect.firstChild) {
            sqlServerSelect.removeChild(sqlServerSelect.firstChild);
        }

        // Check if we have SQL Server options in our combined config
        if (combinedConfig && combinedConfig.sqlServer && combinedConfig.sqlServer.options) {
            const options = combinedConfig.sqlServer.options;
            console.log("SQL Server options from config:", options);

            // Add new options
            options.forEach(optText => {
                const option = document.createElement('option');
                option.value = optText;
                option.textContent = optText;
                sqlServerSelect.appendChild(option);
            });

            // Set default value
            if (combinedConfig.sqlServer.default) {
                sqlServerSelect.value = combinedConfig.sqlServer.default;
            }
        } else {
            // Fallback to the main schema if no specific options found
            console.log("No specific SQL Server options found, using defaults");
            const placeholderOption = document.createElement('option');
            placeholderOption.value = "";
            placeholderOption.textContent = "No SQL servers available for this selection";
            placeholderOption.disabled = true;
            placeholderOption.selected = true;
            sqlServerSelect.appendChild(placeholderOption);
        }

        console.log("SQL Server options updated, current value:", sqlServerSelect.value);
        console.log("SQL Server dropdown now has", sqlServerSelect.options.length, "options");
    } environmentInput.addEventListener('change', handleEnvironmentChange);

    // Add event listener for subscription changes to update SQL Server options
    subscriptionInput.addEventListener('change', function () {
        console.log("Subscription changed to:", subscriptionInput.value);
        updateSqlServerBasedOnEnvironmentAndSubscription();
    });

    updateDropdownOptions(subscriptionInput, "subscription"); // initialize subscription options
    updateSqlServerBasedOnEnvironmentAndSubscription(); // initialize SQL Server options// Form validation
    form.addEventListener('submit', function (event) {
        event.preventDefault(); let isValid = true;
        const environment = environmentInput.value;
        const subscription = subscriptionInput.value;
        const sqlServer = form.querySelector('[name="sqlServer"]').value;

        // Get config for current environment
        const envConfig = getConfigForEnvironment(environment);

        // Validate subscription against allowed values in config
        if (envConfig && envConfig.subscription && envConfig.subscription.options &&
            !envConfig.subscription.options.includes(subscription)) {
            alert(`${environment} environment can only use subscriptions: ${envConfig.subscription.options.join(', ')}`);
            isValid = false;
        }

        // Validate SQL Server against allowed values using the combined config
        const combinedConfig = getConfigForEnvironmentAndSubscription(environment, subscription);
        if (combinedConfig && combinedConfig.sqlServer &&
            combinedConfig.sqlServer.options &&
            !combinedConfig.sqlServer.options.includes(sqlServer)) {

            alert(`For ${environment} environment with ${subscription} subscription, allowed SQL Servers are: ${combinedConfig.sqlServer.options.join(', ')}`);
            isValid = false;
        }

        if (isValid) {
            alert('Form submitted successfully!');
            // Form would be submitted here in a real application
        }
    });
}

// Initialize the form when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function () {
    createForm(schema);
});
