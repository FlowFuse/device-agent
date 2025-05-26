package cmd

import (
	"fmt"

	"github.com/flowfuse/device-agent-installer/pkg/config"
	"github.com/flowfuse/device-agent-installer/pkg/logger"
	"github.com/flowfuse/device-agent-installer/pkg/nodejs"
	"github.com/flowfuse/device-agent-installer/pkg/service"
	"github.com/flowfuse/device-agent-installer/pkg/utils"
	"github.com/flowfuse/device-agent-installer/pkg/validate"
)

// Install performs the installation of Node.js, the device agent, and sets up the service
func Install(nodeVersion, agentVersion, installerDir string, url string, otc string) error {
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
	if err := nodejs.EnsureNodeJs(nodeVersion, workDir); err != nil {
		logger.Error("Node.js setup failed: %v", err)
		logger.LogFunctionExit("Install", nil, err)
		return fmt.Errorf("node.js setup failed: %w", err)
	}
	logger.Debug("Node.js check/installation successful")

	// Install the device agent package
	logger.Info("Installing FlowFuse Device Agent package...")
	if err := nodejs.InstallDeviceAgent(agentVersion, workDir); err != nil {
		logger.Error("Device Agent package installation failed: %v", err)
		logger.LogFunctionExit("Install", nil, err)
		return fmt.Errorf("device agent installation failed: %w", err)
	}
	logger.Debug("Device Agent installation successful")

	// Configure the device agent
	logger.Info("Configuring FlowFuse Device Agent...")
	if err := nodejs.ConfigureDeviceAgent(url, otc, workDir); err != nil {
		logger.Error("Device agent configuration failed: %v", err)
		logger.LogFunctionExit("Install", nil, err)
		return fmt.Errorf("device agent configuration failed: %w", err)
	}
	logger.Debug("Device agent configuration successful")

	// Create service configuration
	logger.Info("Configuring FlowFuse Device Agent to run as system service...")
	if err := service.Install("flowfuse-device-agent", workDir); err != nil {
		logger.Error("Service setup failed: %v", err)
		logger.LogFunctionExit("Install", nil, err)
		return fmt.Errorf("service setup failed: %w", err)
	}
	logger.Debug("Service setup successful")

	// Save the configuration
	cfg := &config.InstallerConfig{
		ServiceUsername: utils.ServiceUsername,
	}
	logger.Debug("Saving configuration: %+v", cfg)
	if err := config.SaveConfig(cfg); err != nil {
		logger.Error("Could not save configuration: %v", err)
	}

	logger.Info("FlowFuse Device Agent installation completed successfully!")
	logger.Info("The service is now running and will start automatically on system boot.")

	logger.LogFunctionExit("Install", "success", nil)
	return nil
}

// Uninstall removes the system service, device agent package and working directory
func Uninstall() error {
	logger.LogFunctionEntry("Uninstall", nil)

	logger.Debug("Running pre-check...")
	if err := utils.CheckPermissions(); err != nil {
		logger.LogFunctionExit("Uninstall", nil, err)
		return fmt.Errorf("permission check failed: %w", err)
	}

	// Check if the device agent is installed
	logger.Debug("Checking if device agent is installed...")
	if !service.IsInstalled("flowfuse-device-agent") {
		err := fmt.Errorf("FlowFuse Device Agent is not installed on this system")
		logger.Error("Installation check failed: %v", err)
		logger.LogFunctionExit("Uninstall", nil, err)
		return err
	}

	// Uninstall the service
	logger.Info("Removing FlowFuse Device Agent service...")
	if err := service.Uninstall("flowfuse-device-agent"); err != nil {
		logger.Error("Service removal failed: %v", err)
		logger.LogFunctionExit("Uninstall", nil, err)
		return fmt.Errorf("service removal failed: %w", err)
	}
	logger.Debug("Service successfully removed")

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

	// Remove the working directory
	logger.Info("Removing working directory...")
	if err := utils.RemoveWorkingDirectory(workDir); err != nil {
		logger.Error("Failed to remove working directory: %v", err)
		logger.LogFunctionExit("Uninstall", nil, err)
		return fmt.Errorf("failed to remove working directory: %w", err)
	}
	logger.Debug("Working directory successfully removed")

	// Remove service account
	logger.Info("Removing service account")
	if err := utils.RemoveServiceUser(savedUsername); err != nil {
		logger.Error("Could not remove service account: %v", err)
		logger.Info("Warning: Could not remove service account: %s", err)
	} else {
		logger.Debug("Service account successfully removed")
	}

	logger.Info("FlowFuse Device Agent has been uninstalled")

	logger.LogFunctionExit("Uninstall", "success", nil)
	return nil
}
