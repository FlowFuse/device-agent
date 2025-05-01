package service

import (
	"fmt"
	"runtime"

	"github.com/flowfuse/device-agent-installer/pkg/logger"
)

// Install creates a new service with the given name in the specified working directory.
// The installation process is operating system specific and currently supports only Linux.
// For other operating systems, it returns an error indicating the OS is not supported.
//
// Parameters:
//   - serviceName: The name to be given to the service
//   - workDir: The working directory where the service will operate
//
// Returns:
//   - error: nil if successful, otherwise an error explaining what went wrong
func Install(serviceName, workDir string) error {
	logger.Info("Installing service %s for %s", serviceName, runtime.GOOS)
	switch runtime.GOOS {
	case "linux":
		return InstallLinux(serviceName, workDir)
	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// Start attempts to start the specified system service.
// It currently only supports Linux operating systems.
// For unsupported operating systems, an error is returned.
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
	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// Stop stops the service with the given name.
// It returns an error if the operation fails or if the operating system is not supported.
// Currently only Linux is supported.
func Stop(serviceName string) error {
	logger.Info("Stopping service %s", serviceName)
	switch runtime.GOOS {
	case "linux":
		return StopLinux(serviceName)
	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// Uninstall removes the specified service from the system.
// It currently supports Linux operating systems only.
// For other operating systems, it returns an error indicating lack of support.
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
	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// IsInstalled checks if a service with the given name is installed on the system.
// Currently, this function only supports Linux operating systems.
// For other operating systems, it logs a message and returns false.
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
	default:
		logger.Info("Service installation check not supported on %s", runtime.GOOS)
		return false
	}
}
