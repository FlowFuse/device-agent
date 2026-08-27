package cmd

import (
	"fmt"
	"os"
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
//   - url: The URL of the FlowFuse instance to connect to
//   - otc: The one-time code (OTC) used for device registration
//   - customWorkDir: Optional custom working directory path. If empty, uses default path.
//   - update: Whether this is an update operation
//   - port: The TCP port number the device agent will use
//
// Returns:
//   - error: An error object if any step of the installation fails, nil otherwise
//
// The function logs detailed information about each step of the process.
func Install(nodeVersion, agentVersion, url, otc, customWorkDir string, update bool, port int, caCertPath string) error {
	logger.LogFunctionEntry("Install", map[string]interface{}{
		"nodeVersion":   nodeVersion,
		"agentVersion":  agentVersion,
		"url":           url,
		"otc":           otc,
		"customWorkDir": customWorkDir,
		"port":          port,
	})

	serviceName := fmt.Sprintf("flowfuse-device-agent-%d", port)

	// Run pre-install validation
	logger.Debug("Running pre-check...")
	if err := validate.PreInstall(customWorkDir, port); err != nil {
		logger.LogFunctionExit("Install", nil, err)
		return fmt.Errorf("pre-check failed: %w", err)
	}

	// Create working directory
	logger.Debug("Creating working directory...")
	workDir, err := utils.CreateWorkingDirectory(customWorkDir)
	if err != nil {
		logger.Error("Failed to create working directory: %v", err)
		logger.LogFunctionExit("Install", nil, err)
		return fmt.Errorf("failed to create working directory: %w", err)
	}
	logger.Debug("Working directory created at: %s", workDir)

	// Resolve and install the custom CA bundle (if any) before Node.js/npm/OTC steps,
	// so both the setup commands and the long-running service trust it.
	// Precedence: --ca-cert flag, then NODE_EXTRA_CA_CERTS env, then the value stored
	// from a previous install (so a bare reinstall keeps CA trust without re-passing it).
	caSrc := caCertPath
	if caSrc == "" {
		caSrc = os.Getenv("NODE_EXTRA_CA_CERTS")
	}
	if caSrc == "" {
		if prev, cfgErr := config.LoadConfig(workDir); cfgErr == nil {
			caSrc = prev.NodeExtraCACerts
		}
	}
	caCertDest, err := utils.InstallCACertificate(caSrc, workDir)
	if err != nil {
		logger.Error("Failed to install CA certificate: %v", err)
		logger.LogFunctionExit("Install", nil, err)
		return fmt.Errorf("failed to install CA certificate: %w", err)
	}
	if caCertDest != "" {
		os.Setenv("NODE_EXTRA_CA_CERTS", caCertDest)
		logger.Debug("Using custom CA certificate bundle: %s", caCertDest)
	}

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
	installMode, autoStartService, err := nodejs.ConfigureDeviceAgent(url, otc, workDir, port)
	if err != nil {
		logger.Error("Device agent configuration failed: %v", err)
		logger.LogFunctionExit("Install", nil, err)
		return fmt.Errorf("device agent configuration failed: %w", err)
	}
	logger.Debug("Device agent configuration successful, mode: %s, autoStart: %v", installMode, autoStartService)

	// Ask whether to run the agent as a system service. With an OTC the
	// installation is scripted, so the service is set up without asking.
	installService := true
	if otc == "" {
		installService = utils.PromptYesNo("Install the system service so the Device Agent starts on system boot?", true)
	}
	logger.Debug("System service requested: %v", installService)

	if installService {
		if service.IsInstalled(serviceName) {
			logger.Debug("Removing FlowFuse Device Agent service...")
			if err := service.Uninstall(serviceName); err != nil {
				logger.Error("Service removal failed: %v", err)
				logger.LogFunctionExit("Install", nil, err)
				return fmt.Errorf("service removal failed: %w", err)
			}
		}

		logger.Info("Configuring FlowFuse Device Agent to run as system service...")
		if err := service.Install(serviceName, workDir, port, caCertDest); err != nil {
			logger.Error("Service setup failed: %v", err)
			logger.LogFunctionExit("Install", nil, err)
			return fmt.Errorf("service setup failed: %w", err)
		}

		logger.Debug("Service setup successful")

		// Start the service if auto-start is enabled for this installation mode
		if autoStartService {
			if err := service.Start(serviceName); err != nil {
				logger.Error("Service start failed: %v", err)
				logger.LogFunctionExit("Install", nil, err)
				return fmt.Errorf("service start failed: %w", err)
			}
			logger.Debug("Service started successfully")
		}
	} else {
		logger.Info("Skipping system service installation.")
	}

	// Save the configuration
	if agentVersion == "latest" {
		var err error
		agentVersion, err = nodejs.GetLatestDeviceAgentVersion(workDir)
		if err != nil {
			return fmt.Errorf("failed to get latest device agent version: %v", err)
		}
	}
	// Only record a service name when a service was actually created
	savedServiceName := ""
	if installService {
		savedServiceName = serviceName
	}
	cfg := &config.InstallerConfig{
		ServiceUsername:  utils.ServiceUsername,
		ServiceName:      savedServiceName,
		NodeVersion:      nodeVersion,
		AgentVersion:     agentVersion,
		Port:             port,
		NodeExtraCACerts: caCertDest,
		ServiceInstalled: &installService,
	}
	logger.Debug("Saving configuration: %+v", cfg)
	if err := config.SaveConfig(cfg, workDir); err != nil {
		logger.Error("Could not save configuration: %v", err)
	}
	utils.ShowInstallSummary(installMode, url, workDir, installService)
	if !installService {
		utils.ShowManualStartInstructions(nodejs.GetNodeBinDir(), workDir, caCertDest, port)
	}

	logger.LogFunctionExit("Install", "success", nil)
	return nil
}

// Uninstall removes the FlowFuse Device Agent from the system.
// It performs the following steps:
// 1. Verifies if the device agent is currently installed
// 2. Removes the device agent service (if installed and running)
// 3. Uninstalls the device agent package
// 4. Removes the working directory
// 5. Removes the service account
//
// The function uses configuration settings if available, or falls back to
// default values when the configuration cannot be loaded.
//
// Returns an error if any step in the uninstallation process fails.
func Uninstall(customWorkDir string) error {
	logger.LogFunctionEntry("Uninstall", map[string]interface{}{
		"customWorkDir": customWorkDir,
	})

	// Get the working directory first to show it in the confirmation prompt
	logger.Debug("Getting working directory...")
	workDir, err := utils.GetWorkingDirectory(customWorkDir)
	if err != nil {
		logger.Error("Failed to get working directory: %v", err)
		logger.LogFunctionExit("Uninstall", nil, err)
		return fmt.Errorf("failed to get working directory: %w", err)
	}

	// Validate that this is actually a FlowFuse Device Agent installation
	logger.Debug("Validating uninstall directory...")
	if err := validate.ValidateUninstallDirectory(workDir); err != nil {
		logger.Error("Uninstall validation failed: %v", err)
		logger.LogFunctionExit("Uninstall", nil, err)
		return fmt.Errorf("uninstall validation failed: %w", err)
	}
	logger.Debug("Uninstall directory validation passed")

	// Show confirmation prompt with the directory path
	logger.Info("")
	logger.Info("You are about to uninstall the FlowFuse Device Agent from: %s\n", workDir)

	confirmed := utils.PromptYesNo("Do you want to proceed with the removal?", false)
	if !confirmed {
		logger.Info("Uninstall cancelled by user")
		logger.LogFunctionExit("Uninstall", "cancelled", nil)
		return nil
	}

	logger.Debug("Running pre-check...")
	if err := utils.CheckPermissions(); err != nil {
		logger.LogFunctionExit("Uninstall", nil, err)
		return fmt.Errorf("permission check failed: %w", err)
	}

	// Check if the device agent service is installed and attempt removal
	logger.Debug("Checking if device agent service is installed...")

	// Determine service name based on config
	var serviceName string
	cfg, _ := config.LoadConfig(customWorkDir)
	if cfg != nil {
		s := cfg.ServiceName
		logger.Debug("Loaded service name from config: %s", s)
		switch s {
		case "":
			serviceName = "flowfuse-device-agent"
		default:
			serviceName = s
		}
	}

	// Installations that run as a service are stopped by removing the service.
	// Without service, the agent could be started by hand and only the user who started
	// it can stop it, so wait for that before removing anything.
	keepServiceAccount := false
	if cfg != nil && cfg.ServiceInstalled != nil && !*cfg.ServiceInstalled {
		logger.Debug("Installation has no system service, checking for running Device Agent processes...")
		if !utils.WaitForAgentProcesses(workDir) {
			keepServiceAccount = true
			logger.Info("Continuing without stopping the Device Agent; the service account will be kept.")
		}
	} else if service.IsInstalled(serviceName) {
		logger.Info("Removing FlowFuse Device Agent service...")
		if err := service.Uninstall(serviceName); err != nil {
			logger.Error("Service removal failed: %v", err)
			logger.LogFunctionExit("Uninstall", nil, err)
			return fmt.Errorf("service removal failed: %w", err)
		}
		logger.Debug("Service successfully removed")
	} else {
		logger.Info("FlowFuse Device Agent service is not installed on this system, skipping service removal")
	}

	// Get the working directory
	logger.Debug("Getting working directory...")
	workDir, err = utils.GetWorkingDirectory(customWorkDir)
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
	cfg, err = config.LoadConfig(customWorkDir)
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

	// Confirm service account removal. It is skipped when the Device Agent was
	// left running, as the account is still in use.
	if keepServiceAccount {
		logger.Info("")
		logger.Info("The service account '%s' was kept, because the FlowFuse Device Agent is still running.", savedUsername)
		logger.Info("Stop it and remove the account manually if you want to clean up the system completely.")
		logger.Info("")
	} else if utils.ConfirmUserRemoval(savedUsername) {
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
			} else if strings.Contains(errorStr, "is currently used by process") ||
				strings.Contains(errorStr, "currently logged in") {
				logger.Info("Service account '%s' is still in use and was not removed:", savedUsername)
				logger.Info("  %v", err)
				logger.Info("Stop the processes using it and run the uninstall again to remove the account.")
			} else {
				// This is an actual removal failure for an existing user - stop execution
				logger.Error("Failed to remove existing service account: %v", err)
				logger.LogFunctionExit("Uninstall", nil, err)
				return fmt.Errorf("failed to remove existing service account: %w", err)
			}
		} else {
			logger.Debug("Service account successfully removed")
		}
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
func Update(agentVersion, nodeVersion, customWorkDir string, updateAgent, updateNode bool) error {
	logger.LogFunctionEntry("Update", map[string]interface{}{
		"updateNode":    updateNode,
		"nodeVersion":   nodeVersion,
		"updateAgent":   updateAgent,
		"agentVersion":  agentVersion,
		"customWorkDir": customWorkDir,
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

	// Determine service name based on config
	var serviceName string
	cfg, _ := config.LoadConfig(customWorkDir)
	if cfg != nil {
		s := cfg.ServiceName
		logger.Debug("Loaded service name from config: %s", s)
		switch s {
		case "":
			serviceName = "flowfuse-device-agent"
		default:
			serviceName = s
		}
	}

	// Installations that declined the system service have no service to check,
	// stop or start; the packages are still updated.
	hasService := cfg == nil || cfg.ServiceInstalled == nil || *cfg.ServiceInstalled
	logger.Debug("Installation has a system service: %v", hasService)

	// Check if the device agent is installed
	if hasService {
		logger.Debug("Checking if device agent (%s) is installed...", serviceName)
		if !service.IsInstalled(serviceName) {
			err := fmt.Errorf("FlowFuse Device Agent is not installed on this system")
			logger.Error("Installation check failed: %v", err)
			logger.LogFunctionExit("Update", nil, err)
			return err
		}
	} else {
		logger.Info("This installation has no system service, updating packages only.")
	}

	// Get the working directory
	logger.Debug("Getting working directory...")
	workDir, err := utils.GetWorkingDirectory(customWorkDir)
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
		isNeeded, err := nodejs.IsAgentUpdateRequired(agentVersion, workDir)
		if err != nil {
			logger.Error("Failed to check if Device Agent update is needed: %v", err)
			return fmt.Errorf("failed to check Device Agent update requirement: %w", err)
		}
		agentUpdateNeeded = isNeeded
		if !isNeeded {
			logger.Info("Device Agent version %s is already installed and up to date", agentVersion)
		}
	}

	// Stop the service temporarily for the update (if we're updating anything).
	// serviceWasStopped stays false when there is no service, which also skips
	// every restart below.
	serviceWasStopped := false
	if hasService && (nodeUpdateNeeded || agentUpdateNeeded) {
		if err := service.Stop(serviceName); err != nil {
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
				if startErr := service.Start(serviceName); startErr != nil {
					logger.Error("Failed to restart service after Node.js update failure: %v", startErr)
				}
			}
			logger.LogFunctionExit("Update", nil, err)
			return fmt.Errorf("node.js update failed: %w", err)
		}
		if err := config.UpdateConfigField("nodeVersion", nodeVersion, customWorkDir); err != nil {
			logger.Error("Failed to update node version in configuration: %v", err)
			logger.LogFunctionExit("Update", nil, err)
			return fmt.Errorf("failed to update node version in configuration: %w", err)
		}

		// Install the Device Agent package only if it was not requested to update
		if !agentUpdateNeeded {
			// Load saved configuration
			logger.Debug("Loading configuration...")
			savedAgentVersion := ""
			cfg, err = config.LoadConfig(customWorkDir)
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
				if startErr := service.Start(serviceName); startErr != nil {
					logger.Error("Failed to restart service after update failure: %v", startErr)
				}
			}
			logger.LogFunctionExit("Update", nil, err)
			return fmt.Errorf("device agent update failed: %w", err)
		}

		if agentVersion == "latest" {
			var err error
			agentVersion, err = nodejs.GetLatestDeviceAgentVersion(workDir)
			if err != nil {
				return fmt.Errorf("failed to get latest device agent version: %v", err)
			}
		}
		if err := config.UpdateConfigField("agentVersion", agentVersion, customWorkDir); err != nil {
			logger.Error("Failed to update agent version in configuration: %v", err)
			logger.LogFunctionExit("Update", nil, err)
			return fmt.Errorf("failed to update agent version in configuration: %w", err)
		}

		logger.Debug("Device Agent update successful")
	}

	if serviceWasStopped {
		if err := service.Start(serviceName); err != nil {
			logger.Error("Service start failed: %v", err)
			logger.LogFunctionExit("Update", nil, err)
			return fmt.Errorf("service start failed: %w", err)
		}
		logger.Debug("Service started successfully")
	}

	// Update service name for legacy installs. Skipped when the installation has
	// no service, where the empty name is accurate rather than missing.
	if cfg != nil && cfg.ServiceName == "" && hasService {
		if config.UpdateConfigField("serviceName", serviceName, customWorkDir); err != nil {
			logger.Error("Failed to update service name in configuration: %v", err)
			logger.LogFunctionExit("Update", nil, err)
			return fmt.Errorf("failed to update service name in configuration: %w", err)
		}
	}
	logger.Info("Update completed successfully!")
	if !hasService {
		utils.ShowManualStartInstructions(nodejs.GetNodeBinDir(), workDir, cfg.NodeExtraCACerts, cfg.Port)
	}

	logger.LogFunctionExit("Update", "success", nil)
	return nil
}
