package cmd

import (
	"fmt"
	"strings"

	"github.com/flowfuse/device-agent-installer/pkg/config"
	"github.com/flowfuse/device-agent-installer/pkg/logger"
	"github.com/flowfuse/device-agent-installer/pkg/nodejs"
	"github.com/flowfuse/device-agent-installer/pkg/service"
	"github.com/flowfuse/device-agent-installer/pkg/utils"
	"github.com/flowfuse/device-agent-installer/pkg/validate"
)

// Install performs the complete installation of the FlowFuse Device Agent.
//
// The function performs the following steps:
// 1. Checks if the process has sufficient permissions
// 2. Creates a working directory for the installation
// 3. Ensures Node.js is installed at the required version
// 4. Installs the Device Agent npm package
// 5. Handles different installation modes based on OTC availability:
//   - Traditional: With OTC, configures and starts service
//   - Manual config: Without OTC, prompts for config and saves device.yml
//   - Install-only: Without OTC and no config, installs but doesn't start service
//
// 6. Sets up the Device Agent to run as a system service
// 7. Saves the installation configuration
//
// Parameters:
//   - nodeVersion: The version of Node.js to install or use
//   - agentVersion: The version of the FlowFuse Device Agent to install
//   - installerDir: The directory where the installer files are located
//   - url: The URL of the FlowFuse instance to connect to
//   - otc: The one-time code (OTC) used for device registration
//
// Returns:
//   - error: An error object if any step of the installation fails, nil otherwise
//
// The function logs detailed information about each step of the process.
func Install(nodeVersion, agentVersion, installerDir, url, otc string, update bool) error {
	logger.LogFunctionEntry("Install", map[string]interface{}{
		"nodeVersion":  nodeVersion,
		"agentVersion": agentVersion,
		"installerDir": installerDir,
		"url":          url,
		"otc":          otc,
	})

	// Run pre-install validation
	logger.Debug("Running pre-check...")
	if err := validate.PreInstall("flowfuse-device-agent"); err != nil {
		logger.LogFunctionExit("Install", nil, err)
		return fmt.Errorf("pre-check failed: %w", err)
	}

	// Create working directory
	logger.Debug("Creating working directory...")
	workDir, err := utils.CreateWorkingDirectory()
	if err != nil {
		logger.Error("Failed to create working directory: %v", err)
		logger.LogFunctionExit("Install", nil, err)
		return fmt.Errorf("failed to create working directory: %w", err)
	}
	logger.Debug("Working directory created at: %s", workDir)

	// Check/install Node.js
	logger.Info("Checking Node.js installation...")
	if err := nodejs.EnsureNodeJs(nodeVersion, workDir, false); err != nil {
		logger.Error("Node.js setup failed: %v", err)
		logger.LogFunctionExit("Install", nil, err)
		return fmt.Errorf("node.js setup failed: %w", err)
	}
	logger.Debug("Node.js check/installation successful")

	// Install the device agent package
	if err := nodejs.InstallDeviceAgent(agentVersion, workDir, update); err != nil {
		logger.Error("Device Agent package installation failed: %v", err)
		logger.LogFunctionExit("Install", nil, err)
		return fmt.Errorf("device agent installation failed: %w", err)
	}
	logger.Debug("Device Agent installation successful")

	// Configure the device agent
	logger.Info("Configuring FlowFuse Device Agent...")
	installMode, autoStartService, err := nodejs.ConfigureDeviceAgent(url, otc, workDir)
	if err != nil {
		logger.Error("Device agent configuration failed: %v", err)
		logger.LogFunctionExit("Install", nil, err)
		return fmt.Errorf("device agent configuration failed: %w", err)
	}
	logger.Debug("Device agent configuration successful, mode: %s, autoStart: %v", installMode, autoStartService)

	if service.IsInstalled("flowfuse-device-agent") {
		logger.Debug("Removing FlowFuse Device Agent service...")
		if err := service.Uninstall("flowfuse-device-agent"); err != nil {
			logger.Error("Service removal failed: %v", err)
			logger.LogFunctionExit("Install", nil, err)
			return fmt.Errorf("service removal failed: %w", err)
		}
	}

	logger.Info("Configuring FlowFuse Device Agent to run as system service...")
	if err := service.Install("flowfuse-device-agent", workDir); err != nil {
		logger.Error("Service setup failed: %v", err)
		logger.LogFunctionExit("Install", nil, err)
		return fmt.Errorf("service setup failed: %w", err)
	}
	
	logger.Debug("Service setup successful")

	// Start the service if auto-start is enabled for this installation mode
	if autoStartService {
		if err := service.Start("flowfuse-device-agent"); err != nil {
			logger.Error("Service start failed: %v", err)
			logger.LogFunctionExit("Install", nil, err)
			return fmt.Errorf("service start failed: %w", err)
		}
		logger.Debug("Service started successfully")
	}

	// Save the configuration
	if agentVersion == "latest" {
		var err error
		agentVersion, err = nodejs.GetLatestDeviceAgentVersion()
		if err != nil {
			return fmt.Errorf("failed to get latest device agent version: %v", err)
		}
	}
	cfg := &config.InstallerConfig{
		ServiceUsername: utils.ServiceUsername,
		NodeVersion:     nodeVersion,
		AgentVersion:    agentVersion,
	}
	logger.Debug("Saving configuration: %+v", cfg)
	if err := config.SaveConfig(cfg); err != nil {
		logger.Error("Could not save configuration: %v", err)
	}
	logger.Info("")
	logger.Info("FlowFuse Device Agent installation completed successfully!")

	switch installMode {
	case "otc", "manual":
		logger.Info("The service is now running and will start automatically on system boot.")
		logger.Info("You can now return to the FlowFuse platform and start creating Node-RED flows on your device")
	case "install-only":
		logger.Info("The Device Agent has been installed but it is not configured.")
		logger.Info("To complete the setup: ")
		logger.Info(" 1. Create a device.yml configuration file in %s directory", workDir)
		logger.Info(" 2. Start the Device Agent service")
	case "none":
		logger.Info("The device agent was already configured. The service has been set up and is running.")
	}

	logger.Info("For information on how to manage the FlowFuse Device Agent,")
	logger.Info("  please refer to the documentation at https://github.com/FlowFuse/device-agent/blob/main/installer/README.md")

	logger.LogFunctionExit("Install", "success", nil)
	return nil
}

// Uninstall removes the FlowFuse Device Agent from the system.
// It performs the following steps:
// 1. Verifies if the device agent is currently installed
// 2. Removes the device agent service
// 3. Uninstalls the device agent package
// 4. Removes the working directory
// 5. Removes the service account that was used to run the agent
//
// The function uses configuration settings if available, or falls back to
// default values when the configuration cannot be loaded.
//
// Returns an error if any step in the uninstallation process fails.
func Uninstall() error {
	logger.LogFunctionEntry("Uninstall", nil)

	logger.Debug("Running pre-check...")
	if err := utils.CheckPermissions(); err != nil {
		logger.LogFunctionExit("Uninstall", nil, err)
		return fmt.Errorf("permission check failed: %w", err)
	}

	// Check if the device agent service is installed and attempt removal
	logger.Debug("Checking if device agent service is installed...")
	if !service.IsInstalled("flowfuse-device-agent") {
		logger.Info("FlowFuse Device Agent service is not installed on this system, skipping service removal")
	} else {
		// Uninstall the service
		logger.Info("Removing FlowFuse Device Agent service...")
		if err := service.Uninstall("flowfuse-device-agent"); err != nil {
			logger.Error("Service removal failed: %v", err)
			logger.LogFunctionExit("Uninstall", nil, err)
			return fmt.Errorf("service removal failed: %w", err)
		}
		logger.Debug("Service successfully removed")
	}

	// Get the working directory
	logger.Debug("Getting working directory...")
	workDir, err := utils.GetWorkingDirectory()
	if err != nil {
		logger.Error("Failed to get working directory: %v", err)
		logger.LogFunctionExit("Uninstall", nil, err)
		return fmt.Errorf("failed to get working directory: %w", err)
	}
	logger.Debug("Working directory: %s", workDir)

	// Uninstall the device agent package
	logger.Info("Removing FlowFuse Device Agent package...")
	if err := nodejs.UninstallDeviceAgent(workDir); err != nil {
		logger.Error("Device agent removal failed: %v", err)
		logger.LogFunctionExit("Uninstall", nil, err)
		return fmt.Errorf("device agent removal failed: %w", err)
	}
	logger.Debug("Device agent package successfully removed")

	// Load saved configuration to get the system username
	logger.Debug("Loading saved configuration...")
	savedUsername := ""
	cfg, err := config.LoadConfig()
	if err != nil {
		logger.Error("Could not load configuration: %v", err)
		logger.Debug("Will use the current username setting for uninstallation.")
		savedUsername = utils.ServiceUsername
		logger.Debug("Falling back to current username: %s", savedUsername)
	} else {
		savedUsername = cfg.ServiceUsername
		logger.Debug("Retrieved username from config: %s", savedUsername)
	}

	// Remove contents of the working directory
	logger.Info("Removing working directory...")
	if err := utils.RemoveWorkingDirectory(workDir); err != nil {
		logger.Error("Failed to remove working directory content: %v", err)
		logger.LogFunctionExit("Uninstall", nil, err)
		return fmt.Errorf("failed to remove working directory content: %w", err)
	}
	logger.Debug("Working directory successfully removed")

	// Remove service account
	logger.Info("Removing service account...")
	if err := utils.RemoveServiceUser(savedUsername); err != nil {
		// Parse error to distinguish between "user not found" and actual removal failure
		errorStr := err.Error()

		// Check for common "user not found" patterns across platforms
		if strings.Contains(errorStr, "user does not exist") ||
			strings.Contains(errorStr, "userdel: user") && strings.Contains(errorStr, "does not exist") ||
			strings.Contains(errorStr, "Record does not exist") ||
			strings.Contains(errorStr, "no such user") {
			logger.Debug("Service account %s does not exist, skipping removal", savedUsername)
		} else {
			// This is an actual removal failure for an existing user - stop execution
			logger.Error("Failed to remove existing service account: %v", err)
			logger.LogFunctionExit("Uninstall", nil, err)
			return fmt.Errorf("failed to remove existing service account: %w", err)
		}
	} else {
		logger.Debug("Service account successfully removed")
	}

	logger.Info("FlowFuse Device Agent has been uninstalled!")

	logger.LogFunctionExit("Uninstall", "success", nil)
	return nil
}

// Update performs the update of the FlowFuse Device Agent and/or Node.js.
//
// The function performs the following steps:
// 1. Checks if the process has sufficient permissions
// 2. Checks if the device agent is currently installed
// 3. Stops the device agent service temporarily (if updating anything)
// 4. Updates Node.js if needed and requested (checks installed version vs required version)
// 5. Updates the Device Agent npm package if requested
// 6. Restarts the device agent service
//
// Parameters:
//   - options: UpdateOptions specifying what to update and to which versions
//
// Returns:
//   - error: An error object if any step of the update fails, nil otherwise
//
// func Update(options UpdateOptions) error {
func Update(agentVersion, nodeVersion string, updateAgent, updateNode bool) error {
	logger.LogFunctionEntry("Update", map[string]interface{}{
		"updateNode":   updateNode,
		"nodeVersion":  nodeVersion,
		"updateAgent":  updateAgent,
		"agentVersion": agentVersion,
	})

	// Validate that at least one update option is specified
	if !updateNode && !updateAgent {
		err := fmt.Errorf("no update options specified, use --update-nodejs and/or --update-agent")
		logger.Error("Update validation failed: %v", err)
		logger.LogFunctionExit("Update", nil, err)
		return err
	}

	// Run pre-update validation
	logger.Debug("Running pre-check...")
	if err := utils.CheckPermissions(); err != nil {
		logger.LogFunctionExit("Update", nil, err)
		return fmt.Errorf("permission check failed: %w", err)
	}

	// Check if the device agent is installed
	logger.Debug("Checking if device agent is installed...")
	if !service.IsInstalled("flowfuse-device-agent") {
		err := fmt.Errorf("FlowFuse Device Agent is not installed on this system")
		logger.Error("Installation check failed: %v", err)
		logger.LogFunctionExit("Update", nil, err)
		return err
	}

	// Get the working directory
	logger.Debug("Getting working directory...")
	workDir, err := utils.GetWorkingDirectory()
	if err != nil {
		logger.Error("Failed to get working directory: %v", err)
		logger.LogFunctionExit("Update", nil, err)
		return fmt.Errorf("failed to get working directory: %w", err)
	}
	logger.Debug("Working directory: %s", workDir)

	// Check if updates are actually needed
	nodeUpdateNeeded := false
	agentUpdateNeeded := false

	if updateNode {
		isNeeded, err := nodejs.IsNodeUpdateRequired(nodeVersion, workDir)
		if err != nil {
			logger.Error("Failed to check if Node.js update is needed: %v", err)
			return fmt.Errorf("failed to check Node.js update requirement: %w", err)
		}
		nodeUpdateNeeded = isNeeded
		if !isNeeded {
			logger.Info("Node.js version %s is already installed and up to date", nodeVersion)
		}
	}

	if updateAgent {
		isNeeded, err := nodejs.IsAgentUpdateRequired(agentVersion)
		if err != nil {
			logger.Error("Failed to check if Device Agent update is needed: %v", err)
			return fmt.Errorf("failed to check Device Agent update requirement: %w", err)
		}
		agentUpdateNeeded = isNeeded
		if !isNeeded {
			logger.Info("Device Agent version %s is already installed and up to date", agentVersion)
		}
	}

	// Stop the service temporarily for the update (if we're updating anything)
	serviceWasStopped := false
	if nodeUpdateNeeded || agentUpdateNeeded {
		if err := service.Stop("flowfuse-device-agent"); err != nil {
			logger.Error("Service stop failed: %v", err)
			logger.LogFunctionExit("Update", nil, err)
			return fmt.Errorf("service stop failed: %w", err)
		}
		logger.Debug("Service stopped successfully")
		serviceWasStopped = true
	}

	// Update Node.js if requested and needed
	if nodeUpdateNeeded {
		if err := nodejs.UpdateNodeJs(nodeVersion, workDir); err != nil {
			logger.Error("Node.js update failed: %v", err)
			// Try to start the service even if Node.js update failed
			if serviceWasStopped {
				logger.Debug("Starting FlowFuse Device Agent service after Node.js update failure")
				if startErr := service.Start("flowfuse-device-agent"); startErr != nil {
					logger.Error("Failed to restart service after Node.js update failure: %v", startErr)
				}
			}
			logger.LogFunctionExit("Update", nil, err)
			return fmt.Errorf("node.js update failed: %w", err)
		}
		if err := config.UpdateConfigField("nodeVersion", nodeVersion); err != nil {
			logger.Error("Failed to update node version in configuration: %v", err)
			logger.LogFunctionExit("Update", nil, err)
			return fmt.Errorf("failed to update node version in configuration: %w", err)
		}

		// Install the Device Agent package only if it was not requested to update
		if !agentUpdateNeeded {
			// Load saved configuration
			logger.Debug("Loading configuration...")
			savedAgentVersion := ""
			cfg, err := config.LoadConfig()
			if err != nil {
				logger.Error("Could not load configuration: %v", err)
				return fmt.Errorf("could not load configuration: %w", err)
			} else {
				savedAgentVersion = cfg.AgentVersion
				logger.Debug("FlowFuse Device agent version from config: %s", savedAgentVersion)
			}

			// Install the device agent package after Node.js update
			if err := nodejs.InstallDeviceAgent(savedAgentVersion, workDir, false); err != nil {
				logger.Error("Device Agent package installation failed: %v", err)
				logger.LogFunctionExit("Install", nil, err)
				return fmt.Errorf("device agent installation failed: %w", err)
			}
		}
		logger.Debug("Node.js updated successful")
	}

	// Update the Device Agent package if requested and needed
	if agentUpdateNeeded {
		if err := nodejs.InstallDeviceAgent(agentVersion, workDir, true); err != nil {
			logger.Error("Device Agent package update failed: %v", err)
			// Try to start the service even if update failed with hope to recover
			if serviceWasStopped {
				logger.Debug("Start FlowFuse Device Agent service after update failure")
				if startErr := service.Start("flowfuse-device-agent"); startErr != nil {
					logger.Error("Failed to restart service after update failure: %v", startErr)
				}
			}
			logger.LogFunctionExit("Update", nil, err)
			return fmt.Errorf("device agent update failed: %w", err)
		}

		if agentVersion == "latest" {
			var err error
			agentVersion, err = nodejs.GetLatestDeviceAgentVersion()
			if err != nil {
				return fmt.Errorf("failed to get latest device agent version: %v", err)
			}
		}
		if err := config.UpdateConfigField("agentVersion", agentVersion); err != nil {
			logger.Error("Failed to update agent version in configuration: %v", err)
			logger.LogFunctionExit("Update", nil, err)
			return fmt.Errorf("failed to update agent version in configuration: %w", err)
		}

		logger.Debug("Device Agent update successful")
	}

	if serviceWasStopped {
		if err := service.Start("flowfuse-device-agent"); err != nil {
			logger.Error("Service start failed: %v", err)
			logger.LogFunctionExit("Update", nil, err)
			return fmt.Errorf("service start failed: %w", err)
		}
		logger.Debug("Service started successfully")
	}

	logger.Info("Update completed successfully!")

	logger.LogFunctionExit("Update", "success", nil)
	return nil
}
