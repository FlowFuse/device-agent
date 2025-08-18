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
// Parameters:
//   - serviceName: The name of the service to stop before removing the directory
//   - customWorkDir: Optional custom working directory path. If empty, uses default path.
//
// Returns:
//   - nil if all checks pass
//   - error if any check fails
func PreInstall(serviceName, customWorkDir string) error {
	if err := utils.CheckPermissions(); err != nil {
		logger.Error("Permission check failed: %v", err)
		logger.LogFunctionExit("PreInstall", nil, err)
		return fmt.Errorf("permission check failed: %w", err)
	}

	if err := checkConfigFileExists(serviceName, customWorkDir); err != nil {
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
// If it exists, it prompts the user with three options:
// 1. Keep existing configuration and continue installation
// 2. Remove all content and do fresh installation
// 3. Cancel installation
// Based on the user's choice, it either preserves the config, removes all content, or cancels the installation.
//
// Parameters:
//   - serviceName: the name of the service to stop before removing the directory (if removal is chosen)
//   - customWorkDir: Optional custom working directory path. If empty, uses default path.
//
// Returns:
//   - error: nil if the configuration file does not exist, user chooses to keep it, or content has been successfully removed,
//     otherwise an error explaining what went wrong or if user cancels installation
func checkConfigFileExists(serviceName, customWorkDir string) error {
	workDir, err := utils.GetWorkingDirectory(customWorkDir)
	if err != nil {
		return fmt.Errorf("failed to get working directory: %w", err)
	}
	deviceAgentConfig := filepath.Join(workDir, "device.yml")

	if _, err := os.Stat(deviceAgentConfig); !os.IsNotExist(err) {
		logger.Info("The working directory %s exists and contains Device Agent configuration file", workDir)

		options := []string{
			"Keep existing configuration and continue installation",
			"Remove all content and do fresh installation",
			"Cancel installation",
		}

		choice, err := utils.PromptOption("Device Agent configuration already exists. What would you like to do?", options, 0)
		if err != nil {
			return fmt.Errorf("failed to get user choice: %w", err)
		}

		switch choice {
		case 0: // Keep existing configuration
			if err := service.Stop(serviceName); err != nil {
				logger.Debug("Failed to stop FlowFuse Device Agent service: %v - continuing anyway", err)
			}
			if err := service.Uninstall(serviceName); err != nil {
				logger.Debug("Failed to uninstall FlowFuse Device Agent service: %v - continuing anyway", err)
			}
			logger.Info("Keeping existing configuration file, continuing with installation...")
		case 1: // Remove all content and do fresh installation
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
		case 2: // Cancel installation
			return fmt.Errorf("installation cancelled by user")
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

// ValidateUninstallDirectory validates that the directory contains a device.yml file
// before allowing uninstall to proceed. This prevents accidental removal of directories
// not related to the FlowFuse Device Agent.
//
// Parameters:
//   - workDir: The directory path to validate
//
// Returns:
//   - error: nil if validation passes, otherwise an error explaining why validation failed
func ValidateUninstallDirectory(workDir string) error {
	logger.LogFunctionEntry("ValidateUninstallDirectory", map[string]interface{}{
		"workDir": workDir,
	})

	// Check if directory exists
	if _, err := os.Stat(workDir); os.IsNotExist(err) {
		logger.Error("Directory does not exist: %s", workDir)
		logger.LogFunctionExit("ValidateUninstallDirectory", nil, err)
		return fmt.Errorf("directory does not exist: %s", workDir)
	}

	// Check if device.yml exists in the directory
	deviceYmlPath := filepath.Join(workDir, "device.yml")
	if _, err := os.Stat(deviceYmlPath); os.IsNotExist(err) {
		logger.LogFunctionExit("ValidateUninstallDirectory", nil, err)
		return fmt.Errorf("%s is not the FlowFuse Device Agent directory. If you installed it in a custom directory, please specify it using `--dir` flag", workDir)
	}

	logger.Debug("Validation passed: device.yml found in %s", workDir)
	logger.LogFunctionExit("ValidateUninstallDirectory", "success", nil)
	return nil
}
