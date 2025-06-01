package validate

import (
	"fmt"
	"os"

	"github.com/flowfuse/device-agent-installer/pkg/logger"
	"github.com/flowfuse/device-agent-installer/pkg/service"
	"github.com/flowfuse/device-agent-installer/pkg/utils"
)

// PreInstall performs validation steps before installation:
// 1. Checks if the working directory exists and attempts to remove it if it does
// 2. Verifies if user has the necessary permissions to run the installer
//
// Returns:
//   - nil if all checks pass
//   - error if any check fails
func PreInstall(serviceName string) error {
	if err := checkConfigFileExists(serviceName); err != nil {
		logger.LogFunctionExit("PreInstall", nil, err)
		return fmt.Errorf("configuration file pre-check failed: %w", err)
	}

	if err := utils.CheckPermissions(); err != nil {
		logger.Error("Permission check failed: %v", err)
		logger.LogFunctionExit("PreInstall", nil, err)
		return fmt.Errorf("permission check failed: %w", err)
	}

	return nil
}

// checkConfigFileExists checks if the Device Agent configuration file exists in the working directory.
// If it exists, it prompts the user to remove it and continues with the installation.
// If the user declines, it returns an error indicating that the directory must be removed manually.
//
// Parameters:
//   - serviceName: the name of the service to stop before removing the directory
//
// Returns:
//   - error: nil if the configuration file does not exist or has been successfully removed,
//     otherwise an error explaining what went wrong
func checkConfigFileExists(serviceName string) error {
	workDir, err := utils.GetWorkingDirectory()
	if err != nil {
		return fmt.Errorf("failed to get working directory: %w", err)
	}
	deviceAgentConfig := fmt.Sprintf("%s/device.yml", workDir)

	if _, err := os.Stat(deviceAgentConfig); !os.IsNotExist(err) {
		logger.Info("The working directory %s exists and contains Device Agent configuration file", workDir)
		userResponse := utils.YesNoPrompt("Do you want to remove it and continue installation?")
		if userResponse {
			if err := service.Stop(serviceName); err != nil {
				logger.Debug("Failed to stop FlowFuse Device Agent service: %v - continuing anyway", err)
			}
			logger.Info("Removing contents of %s ...", workDir)
			if err := utils.RemoveWorkingDirectory(workDir); err != nil {
				return fmt.Errorf("failed to remove working directory contents: %w", err)
			}
		} else {
			return fmt.Errorf("the %s directory has not been removed. Please remove it manually and try again", workDir)
		}
	}
	return nil
}
