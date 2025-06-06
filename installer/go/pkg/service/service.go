package service

import (
	"fmt"
	"runtime"

	"github.com/flowfuse/device-agent-installer/pkg/logger"
)

// Install function creates a new service with the given name in the specified working directory.
// It sets up the necessary configurations and permissions for the service to run.
//
// Parameters:
//   - serviceName: The name to be given to the service
//   - workDir: The working directory where the service will operate
//
// Returns:
//   - error: nil if successful, otherwise an error explaining what went wrong
func Install(serviceName, workDir string) error {
	logger.Info("Installing service %s for %s...", serviceName, runtime.GOOS)
	switch runtime.GOOS {
	case "linux":
		return InstallLinux(serviceName, workDir)
	case "windows":
		return InstallWindows(serviceName, workDir)
	case "darwin":
		return InstallDarwin(workDir)
	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// Start function attempts to start the specified system service.
//
// Parameters:
//   - serviceName: the name of the service to start
//
// Returns:
//   - error: nil if the service started successfully, otherwise an error describing what went wrong
func Start(serviceName string) error {
	logger.Info("Starting service %s", serviceName)
	switch runtime.GOOS {
	case "linux":
		return StartLinux(serviceName)
	case "windows":
		return StartWindows(serviceName)
	case "darwin":
		return StartDarwin()
	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// Stop function stops the service with the given name.
// It returns an error if the operation fails or if the operating system is not supported.
// 
// Parameters:
//   - serviceName: the name of the service to stop
//
// Returns:
//   - error: nil if the service stopped successfully, otherwise an error describing what went wrong
func Stop(serviceName string) error {
	logger.Info("Stopping service %s", serviceName)
	switch runtime.GOOS {
	case "linux":
		return StopLinux(serviceName)
	case "windows":
		return StopWindows(serviceName)
	case "darwin":
		return StopDarwin()
	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// Uninstall function removes the specified service from the system.
//
// Parameters:
//   - serviceName: The name of the service to be uninstalled
//
// Returns:
//   - error: An error if the uninstallation fails or if the operating system is not supported
func Uninstall(serviceName string) error {
	logger.Debug("Uninstalling service %s", serviceName)
	switch runtime.GOOS {
	case "linux":
		return UninstallLinux(serviceName)
	case "windows":
		return UninstallWindows(serviceName)
	case "darwin":
		return UninstallDarwin()
	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// IsInstalled checks if a service with the given name is installed on the system.
//
// Parameters:
//   - serviceName: the name of the service to check
//
// Returns:
//   - bool: true if the service is installed, false otherwise or if the OS is not supported
func IsInstalled(serviceName string) bool {
	switch runtime.GOOS {
	case "linux":
		return IsInstalledLinux(serviceName)
	case "windows":
		return IsInstalledWindows(serviceName)
	case "darwin":
		return IsInstalledDarwin()
	default:
		logger.Info("Service installation check not supported on %s", runtime.GOOS)
		return false
	}
}
