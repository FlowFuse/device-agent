package validate

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"runtime"

	"github.com/flowfuse/device-agent-installer/pkg/config"
	"github.com/flowfuse/device-agent-installer/pkg/logger"
	"github.com/flowfuse/device-agent-installer/pkg/service"
	"github.com/flowfuse/device-agent-installer/pkg/utils"
)

// Minimum free space required for installation
const minFreeDiskBytes uint64 = 500 * 1024 * 1024 // 500 MB

// PreInstall performs validation steps before installation:
// 1. Checks if the working directory exists and attempts to remove it if it does
// 2. Verifies if user has the necessary permissions to run the installer
//
// Parameters:
//   - customWorkDir: Optional custom working directory path. If empty, uses default path.
//   - port: The TCP port to validate for availability.
//
// Returns:
//   - nil if all checks pass
//   - error if any check fails
func PreInstall(customWorkDir string, port int) error {
	if err := utils.CheckPermissions(); err != nil {
		logger.Error("Permission check failed: %v", err)
		logger.LogFunctionExit("PreInstall", nil, err)
		return fmt.Errorf("permission check failed: %w", err)
	}

	if err := checkFreeDiskSpace(customWorkDir, minFreeDiskBytes); err != nil {
		logger.Error("Disk space check failed: %v", err)
		logger.LogFunctionExit("PreInstall", nil, err)
		return fmt.Errorf("disk space check failed: %w", err)
	}

	if err := checkUnusedPort(port); err != nil {
		logger.Error("Port check failed: %v", err)
		logger.LogFunctionExit("PreInstall", nil, err)
		return fmt.Errorf("port check failed: %w", err)
	}

	if err := checkConfigFileExists(customWorkDir); err != nil {
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
//   - customWorkDir: Optional custom working directory path. If empty, uses default path.
//
// Returns:
//   - error: nil if the configuration file does not exist, user chooses to keep it, or content has been successfully removed,
//     otherwise an error explaining what went wrong or if user cancels installation
func checkConfigFileExists(customWorkDir string) error {
	logger.LogFunctionEntry("checkConfigFileExists", map[string]interface{}{
		"customWorkDir": customWorkDir,
	})

	workDir, err := utils.GetWorkingDirectory(customWorkDir)
	if err != nil {
		return fmt.Errorf("failed to get working directory: %w", err)
	}
	deviceAgentConfig := filepath.Join(workDir, "device.yml")
	installerConfPath := filepath.Join(workDir, "installer.conf")
	_, deviceAgentConfigErr := os.Stat(deviceAgentConfig)
	_, installerConfErr := os.Stat(installerConfPath)
	logger.Debug("DeviceAgentConfigErr: %v", deviceAgentConfigErr)
	logger.Debug("installerConfErr: %v", installerConfErr)
	logger.Debug("devAgentExists: %t", os.IsNotExist(deviceAgentConfigErr))
	logger.Debug("installerConfExists: %t", os.IsNotExist(installerConfErr))

	if deviceAgentConfigErr == nil || installerConfErr == nil {
		logger.Info("The working directory %s exists and contains Device Agent configuration file", workDir)

		// Derive per-port service name from installer config (fallback to default port)
		cfg, cfgErr := config.LoadConfig(customWorkDir)
		port := utils.DefaultPort
		if cfgErr != nil {
			logger.Debug("Could not load installer config to derive port: %v. Using default port %d", cfgErr, port)
		} else {
			port = cfg.Port
			logger.Debug("Derived port %d from installer config for service operations", port)
		}
		perPortService := fmt.Sprintf("flowfuse-device-agent-%d", port)
		legacyService := "flowfuse-device-agent"

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
			// Try per-port service first, then legacy name
			if service.IsInstalled(perPortService) {
				if err := service.Stop(perPortService); err != nil {
					logger.Debug("Failed to stop service %s: %v - continuing", perPortService, err)
				}
				if err := service.Uninstall(perPortService); err != nil {
					logger.Debug("Failed to uninstall service %s: %v - continuing", perPortService, err)
				}
			} else if service.IsInstalled(legacyService) {
				if err := service.Stop(legacyService); err != nil {
					logger.Debug("Failed to stop legacy service %s: %v - continuing", legacyService, err)
				}
				if err := service.Uninstall(legacyService); err != nil {
					logger.Debug("Failed to uninstall legacy service %s: %v - continuing", legacyService, err)
				}
			}
			logger.Info("Keeping existing configuration file, continuing with installation...")
		case 1: // Remove all content and do fresh installation
			if service.IsInstalled(perPortService) {
				if err := service.Stop(perPortService); err != nil {
					logger.Debug("Failed to stop service %s: %v - continuing", perPortService, err)
				}
				if err := service.Uninstall(perPortService); err != nil {
					logger.Debug("Failed to uninstall service %s: %v - continuing", perPortService, err)
				}
			} else if service.IsInstalled(legacyService) {
				if err := service.Stop(legacyService); err != nil {
					logger.Debug("Failed to stop legacy service %s: %v - continuing", legacyService, err)
				}
				if err := service.Uninstall(legacyService); err != nil {
					logger.Debug("Failed to uninstall legacy service %s: %v - continuing", legacyService, err)
				}
			}
			logger.Info("Removing contents of %s ...", workDir)
			if err := utils.RemoveWorkingDirectory(workDir); err != nil {
				return fmt.Errorf("failed to remove working directory contents: %w", err)
			}
		case 2: // Cancel installation
			return fmt.Errorf("installation cancelled by user")
		}
	}
	logger.LogFunctionExit("checkConfigFileExists", nil, nil)
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

// ValidateUninstallDirectory validates that the directory contains either device.yml or installer.conf files
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

	// Check if device.yml or installer.conf exists in the directory
	deviceYmlPath := filepath.Join(workDir, "device.yml")
	installerConfPath := filepath.Join(workDir, "installer.conf")
	_, deviceYmlErr := os.Stat(deviceYmlPath)
	_, installerConfErr := os.Stat(installerConfPath)
	if os.IsNotExist(deviceYmlErr) && os.IsNotExist(installerConfErr) {
		logger.LogFunctionExit("ValidateUninstallDirectory", nil, fmt.Errorf("missing required files in %s: %v, %v", workDir, deviceYmlErr, installerConfErr))
		return fmt.Errorf("%s is not the FlowFuse Device Agent directory. If you installed it in a custom directory, please specify it using `--dir` flag", workDir)
	}

	logger.Debug("Validation passed: device.yml found in %s", workDir)
	logger.LogFunctionExit("ValidateUninstallDirectory", "success", nil)
	return nil
}

// checkUnusedPort validates if specified TCP port is not in use by any process.
//
// Parameters
//   - port: The TCP port to validate for availability.
//
// Returns:
//   - error: nil if the port is available, otherwise an error indicating the port is in use
func checkUnusedPort(port int) error {
	logger.LogFunctionEntry("checkUnusedPort", map[string]interface{}{
		"port": port,
	})
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		logger.LogFunctionExit("checkUnusedPort", "error", err)
		logger.Debug("Port %d is in use: %v", port, err)
		return fmt.Errorf("port %d is in use. Please select another port and try again", port)
	}
	defer listener.Close()
	logger.LogFunctionExit("checkUnusedPort", "success", nil)
	return nil
}

// checkFreeDiskSpace validates free disk space for the install directory and OS temp directory.
// It requires at least requiredBytes free in each distinct location.
// /
// Parameters:
//   - customWorkDir: Install directory path. If empty, uses default path.
//   - requiredBytes: Minimum required free space in bytes.
//
// Returns:
//   - error: nil if both locations have sufficient free space, otherwise an error indicating insufficient space
func checkFreeDiskSpace(customWorkDir string, requiredBytes uint64) error {
	logger.LogFunctionEntry("checkFreeDiskSpace", map[string]interface{}{
		"customWorkDir": customWorkDir,
		"requiredBytes": requiredBytes,
	})

	workDir, err := utils.GetWorkingDirectory(customWorkDir)
	if err != nil {
		logger.LogFunctionExit("checkFreeDiskSpace", nil, err)
		return fmt.Errorf("failed to get working directory: %w", err)
	}

	tempDir := os.TempDir()

	type target struct {
		path  string
		label string
	}
	targets := []target{{workDir, "install directory"}}
	if filepath.Clean(tempDir) != filepath.Clean(workDir) {
		targets = append(targets, target{tempDir, "temporary directory"})
	}

	for _, t := range targets {
		ok, free, err := utils.HasEnoughDiskSpace(t.path, requiredBytes)
		if err != nil {
			logger.LogFunctionExit("checkFreeDiskSpace", nil, err)
			return fmt.Errorf("failed to check disk space for %s (%s): %w", t.label, t.path, err)
		}
		if !ok {
			requiredMB := float64(requiredBytes) / (1024 * 1024)
			freeMB := float64(free) / (1024 * 1024)
			// err := fmt.Errorf("insufficient disk space in %s (%s): need at least %.1f MB, available %.1f MB", t.label, t.path, requiredMB, freeMB)
			err := fmt.Errorf("insufficient disk space in %s (%s): need at least %.1f MB, available %.1f MB\n" +
				"For information on how to handle this error, visit: http://flowfuse.com/docs/device-agent/install/device-agent-installer/#disk-space-check-failed-error",
    		t.label, t.path, requiredMB, freeMB)
			logger.LogFunctionExit("checkFreeDiskSpace", nil, err)
			return err
		}
	}

	logger.LogFunctionExit("checkFreeDiskSpace", "success", nil)
	return nil
}
