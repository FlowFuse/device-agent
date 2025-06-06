package validate

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"

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
	if err := utils.CheckPermissions(); err != nil {
		logger.Error("Permission check failed: %v", err)
		logger.LogFunctionExit("PreInstall", nil, err)
		return fmt.Errorf("permission check failed: %w", err)
	}
	
	if err := checkConfigFileExists(serviceName); err != nil {
		logger.LogFunctionExit("PreInstall", nil, err)
		return fmt.Errorf("configuration file pre-check failed: %w", err)
	}

	if err := checkLibstdcExists(); err != nil {
		logger.Error("Library check failed: %v", err)
		logger.LogFunctionExit("PreInstall", nil, err)
		return fmt.Errorf("library check failed: %w", err)
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
	deviceAgentConfig := filepath.Join(workDir, "device.yml")

	if _, err := os.Stat(deviceAgentConfig); !os.IsNotExist(err) {
		logger.Info("The working directory %s exists and contains Device Agent configuration file", workDir)
		userResponse := utils.YesNoPrompt("Do you want to remove it and continue installation?")
		if userResponse {
			if err := service.Stop(serviceName); err != nil {
				logger.Debug("Failed to stop FlowFuse Device Agent service: %v - continuing anyway", err)
			}
			if err := service.Uninstall(serviceName); err != nil {
				logger.Debug("Failed to uninstall FlowFuse Device Agent service: %v - continuing anyway", err)
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

// CheckLibstdcExists checks for the presence of libstdc++ in common locations
// across different Linux distributions and architectures.
//
// Returns:
//   - nil if libstdc++ is found in any of the checked locations
//   - error if libstdc++ is not found in any location
func checkLibstdcExists() error {
		if runtime.GOOS == "linux" {
		// Check common library directories with glob patterns
		globPatterns := []string{
			"/usr/lib/*/libstdc++.so.6", // Multi-arch directories
			"/usr/lib*/libstdc++.so.6",  // lib, lib64, etc.
			"/lib/*/libstdc++.so.6",     // Multi-arch in /lib
			"/lib*/libstdc++.so.6",      // lib, lib64, etc. in /lib
		}

		for _, pattern := range globPatterns {
			matches, err := filepath.Glob(pattern)
			if err == nil && len(matches) > 0 {
				logger.Debug("Found libstdc++ at: %s", matches[0])
				return nil
			}
		}
		return fmt.Errorf("libstdc++ is not installed, please install it before proceeding")
	}
	return nil
}
