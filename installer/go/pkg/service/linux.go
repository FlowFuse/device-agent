package service

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"text/template"

	"github.com/flowfuse/device-agent-installer/pkg/logger"
	"github.com/flowfuse/device-agent-installer/pkg/nodejs"
	"github.com/flowfuse/device-agent-installer/pkg/utils"
)

// ServiceConfig holds the data for the service template
type ServiceConfig struct {
	User         string
	WorkDir      string
	NodeBinDir   string
	ServiceName  string // Used for sysvinit scripts
	LogFile      string // Log file path for openrc scripts
	ErrorLogFile string // Error log file path for openrc scripts
	Port         int
}

// IsSystemd returns true if the system uses systemd, false otherwise
// This is determined by checking if the "systemctl" command is available
//
// Returns:
//   - true if systemd is found, false otherwise
func IsSystemd() bool {
	logger.LogFunctionEntry("IsSystemd", nil)
	_, err := exec.LookPath("systemctl")
	logger.LogFunctionExit("IsSystemd", nil, nil)
	return err == nil
}

// IsSysVInit returns true if the system uses SysV init, false otherwise
// This is determined by checking if SysV init service management tools (update-rc.d or chkconfig) are available
//
// Returns:
//   - true if SysV init tools are found, false otherwise
func IsSysVInit() bool {
	logger.LogFunctionEntry("IsSysVInit", nil)
	defer logger.LogFunctionExit("IsSysVInit", nil, nil)

	// Check for SysV init service management tools
	_, err1 := exec.LookPath("update-rc.d") // Debian/Ubuntu SysV
	_, err2 := exec.LookPath("chkconfig")   // Red Hat/CentOS SysV

	hasSysVTools := (err1 == nil || err2 == nil)
	return hasSysVTools
}

// IsOpenRC returns true if the system uses OpenRC, false otherwise
// This is determined by checking if the "rc-service" command is available
//
// Returns:
//   - true if OpenRC is found, false otherwise
func IsOpenRC() bool {
	logger.LogFunctionEntry("IsOpenRC", nil)
	defer logger.LogFunctionExit("IsOpenRC", nil, nil)

	_, err := exec.LookPath("rc-service")
	return err == nil
}

// InstallLinux creates and installs a service on Linux systems.
// It detects whether to use systemd or sysvinit based on the system configuration.
//
// Parameters:
//   - serviceName: the name of the service to create
//   - workDir: the working directory for the service
//   - port: the port number the service will use
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
func InstallLinux(serviceName, workDir string, port int) error {
	logger.LogFunctionEntry("InstallLinux", map[string]interface{}{
		"serviceName": serviceName,
		"workDir":     workDir,
		"port":        port,
	})
	defer logger.LogFunctionExit("InstallLinux", nil, nil)

	if IsSystemd() {
		return InstallSystemd(serviceName, workDir, port)
	} else if IsSysVInit() {
		return InstallSysVInit(serviceName, workDir, port)
	} else if IsOpenRC() {
		return InstallOpenRC(serviceName, workDir, port)
	} else {
		logger.Error("No supported init system found (systemd or sysvinit)")
		return fmt.Errorf("no supported init system found (systemd or sysvinit)")
	}
}

// InstallSystemd creates and installs a systemd service on Linux systems.
//
// The function checks if systemd is available, creates a service configuration,
// generates a service file from a template, and installs it using systemd commands.
// It also sets appropriate permissions and enables the service to start on boot.
//
// Parameters:
//   - serviceName: the name of the systemd service to create
//   - workDir: the working directory for the service
//   - port: the port number the service will use
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
func InstallSystemd(serviceName, workDir string, port int) error {
	logger.LogFunctionEntry("InstallSystemd", map[string]interface{}{
		"serviceName": serviceName,
		"workDir":     workDir,
	})
	defer logger.LogFunctionExit("InstallSystemd", nil, nil)

	config := ServiceConfig{
		User:       utils.ServiceUsername,
		WorkDir:    workDir,
		NodeBinDir: nodejs.GetNodeBinDir(),
		Port:       port,
	}

	serviceFilePath := "/etc/systemd/system/" + serviceName + ".service"

	tmpl, err := template.New("service").Parse(SystemdServiceTemplate)
	if err != nil {
		return fmt.Errorf("failed to parse service template: %w", err)
	}

	tmpFile, err := os.CreateTemp("", "flowfuse-service-")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	defer os.Remove(tmpFile.Name())

	if err := tmpl.Execute(tmpFile, config); err != nil {
		return fmt.Errorf("failed to execute service template: %w", err)
	}
	tmpFile.Close()

	// Copy the service file to systemd directory
	copyCmd := exec.Command("sudo", "cp", tmpFile.Name(), serviceFilePath)
	if output, err := copyCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to copy service file: %w\nOutput: %s", err, output)
	}

	chmodCmd := exec.Command("sudo", "chmod", "644", serviceFilePath)
	if err := chmodCmd.Run(); err != nil {
		return fmt.Errorf("failed to set service file permissions: %w", err)
	}

	reloadCmd := exec.Command("sudo", "systemctl", "daemon-reload")
	if output, err := reloadCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to reload systemd: %w\nOutput: %s", err, output)
	}

	enableCmd := exec.Command("sudo", "systemctl", "enable", serviceName)
	if output, err := enableCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to enable service: %w\nOutput: %s", err, output)
	}

	return nil
}

// InstallSysVInit creates and installs a SysVInit service script on Linux systems.
//
// The function checks if /etc/init.d exists, creates a service configuration,
// generates a service script from a template, and installs it using appropriate commands.
// It also sets appropriate permissions and enables the service to start on boot.
//
// Parameters:
//   - serviceName: the name of the service to create
//   - workDir: the working directory for the service
//   - port: the port number the service will use
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
//
// The function requires sudo privileges to:
//   - Copy the service script to /etc/init.d/
//   - Set permissions on the service script
//   - Enable the service
func InstallSysVInit(serviceName, workDir string, port int) error {
	logger.LogFunctionEntry("InstallSysVInit", map[string]interface{}{
		"serviceName": serviceName,
		"workDir":     workDir,
	})
	defer logger.LogFunctionExit("InstallSysVInit", nil, nil)

	config := ServiceConfig{
		User:        utils.ServiceUsername,
		WorkDir:     workDir,
		NodeBinDir:  nodejs.GetNodeBinDir(),
		ServiceName: serviceName,
		Port:        port,
	}

	serviceFilePath := "/etc/init.d/" + serviceName

	tmpl, err := template.New("service").Parse(SysVInitServiceTemplate)
	if err != nil {
		return fmt.Errorf("failed to parse service template: %w", err)
	}

	tmpFile, err := os.CreateTemp("", "flowfuse-service-")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	defer os.Remove(tmpFile.Name())

	if err := tmpl.Execute(tmpFile, config); err != nil {
		return fmt.Errorf("failed to execute service template: %w", err)
	}
	tmpFile.Close()

	// Copy the service file to init.d directory
	copyCmd := exec.Command("sudo", "cp", tmpFile.Name(), serviceFilePath)
	if output, err := copyCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to copy service file: %w\nOutput: %s", err, output)
	}

	// Make the script executable
	chmodCmd := exec.Command("sudo", "chmod", "+x", serviceFilePath)
	if err := chmodCmd.Run(); err != nil {
		return fmt.Errorf("failed to set service file permissions: %w", err)
	}

	// Enable the service with update-rc.d or chkconfig
	var enableCmd *exec.Cmd
	if _, err := exec.LookPath("update-rc.d"); err == nil {
		enableCmd = exec.Command("sudo", "update-rc.d", serviceName, "defaults")
	} else if _, err := exec.LookPath("chkconfig"); err == nil {
		enableCmd = exec.Command("sudo", "chkconfig", "--add", serviceName)
	} else {
		logger.Debug("Could not find update-rc.d or chkconfig, service may not start on boot")
	}

	if enableCmd != nil {
		if output, err := enableCmd.CombinedOutput(); err != nil {
			logger.Debug("Failed to enable service: %s", output)
			return fmt.Errorf("failed to enable service: %w\nOutput: %s", err, output)
		}
	}

	return nil
}

// InstallOpenRC creates and installs an OpenRC service script on Linux systems.
// The function creates a log directory, sets ownership, generates a service script from a template,
// and installs it using OpenRC commands. It also sets appropriate permissions and enables the service.
//
// Parameters:
//   - serviceName: the name of the OpenRC service to create
//   - workDir: the working directory for the service
//   - port: the port number the service will use
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
func InstallOpenRC(serviceName, workDir string, port int) error {
	logger.LogFunctionEntry("InstallOpenRC", map[string]interface{}{
		"serviceName": serviceName,
		"workDir":     workDir,
	})
	defer logger.LogFunctionExit("InstallOpenRC", nil, nil)

	// Create the log directory
	logDir := filepath.Join(workDir, "logs")
	mkdirCmd := exec.Command("sudo", "mkdir", "-p", logDir)
	if output, err := mkdirCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to create directory %s: %w\nOutput: %s", logDir, err, output)
	}

	logger.Debug("Setting ownership of %s to %s...", logDir, utils.ServiceUsername)
	chownCmd := exec.Command("sudo", "chown", "-R", utils.ServiceUsername, logDir)
	if output, err := chownCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set logs directory ownership: %w\nOutput: %s", err, output)
	}

	logFilePath := filepath.Join(logDir, fmt.Sprintf("%s.log", serviceName))
	errorLogFilePath := filepath.Join(logDir, fmt.Sprintf("%s-error.log", serviceName))

	config := ServiceConfig{
		User:         utils.ServiceUsername,
		WorkDir:      workDir,
		NodeBinDir:   nodejs.GetNodeBinDir(),
		LogFile:      logFilePath,
		ErrorLogFile: errorLogFilePath,
		Port:         port,
	}

	serviceFilePath := "/etc/init.d/" + serviceName

	tmpl, err := template.New("service").Parse(OpenRCServiceTemplate)
	if err != nil {
		return fmt.Errorf("failed to parse service template: %w", err)
	}

	tmpFile, err := os.CreateTemp("", "flowfuse-service-")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	defer os.Remove(tmpFile.Name())

	if err := tmpl.Execute(tmpFile, config); err != nil {
		return fmt.Errorf("failed to execute service template: %w", err)
	}
	tmpFile.Close()

	copyCmd := exec.Command("sudo", "cp", tmpFile.Name(), serviceFilePath)
	if output, err := copyCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to copy service file: %w\nOutput: %s", err, output)
	}

	chmodCmd := exec.Command("sudo", "chmod", "+x", serviceFilePath)
	if err := chmodCmd.Run(); err != nil {
		return fmt.Errorf("failed to set service file permissions: %w", err)
	}

	if output, err := exec.Command("sudo", "rc-update", "add", serviceName).CombinedOutput(); err != nil {
		return fmt.Errorf("failed to enable service: %w\nOutput: %s", err, output)
	}

	return nil
}

// StartLinux starts a service on Linux systems.
// It detects whether to use systemd or sysvinit based on the service location.
//
// Parameters:
//   - serviceName: The name of the service to start
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
func StartLinux(serviceName string) error {
	if IsSystemd() && IsInstalledSystemd(serviceName) {
		return StartSystemd(serviceName)
	} else if IsSysVInit() && IsInstalledSysVInit(serviceName) {
		return StartSysVInit(serviceName)
	} else if IsOpenRC() && IsInstalledSysVInit(serviceName) {
		return StartOpenRC(serviceName)
	}
	logger.Error("No supported init system found or service not installed")
	return fmt.Errorf("no supported init system found or service not installed")
}

// StartSystemd starts a systemd service
// The function checks if the service is active after starting it.
// If the service is not active, it retrieves the status and logs it.
//
// Parameters:
//   - serviceName: The name of the systemd service to start
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
func StartSystemd(serviceName string) error {
	startCmd := exec.Command("sudo", "systemctl", "start", serviceName)
	if output, err := startCmd.CombinedOutput(); err != nil {
		logger.Error("Failed to start service: %s", output)
		return fmt.Errorf("failed to start service: %w\nOutput: %s", err, output)
	}

	statusActiveCmd := exec.Command("sudo", "systemctl", "is-active", "--quiet", serviceName)
	if err := statusActiveCmd.Run(); err != nil {
		statusFullCmd := exec.Command("sudo", "systemctl", "status", serviceName)
		statusOutput, _ := statusFullCmd.CombinedOutput() // Ignore error here as status might return non-zero
		logger.Debug("Service status:\n%s", statusOutput)
		logger.Error("Service is not active")
		return fmt.Errorf("service is not active: %w", err)
	}

	return nil
}

// StartSysVInit starts a sysvinit service
// The function checks if the service is active after starting it.
// If the service is not active, it retrieves the status and logs it.
//
// Parameters:
//   - serviceName: The name of the sysvinit service to start
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
func StartSysVInit(serviceName string) error {
	startCmd := exec.Command("sudo", "service", serviceName, "start")
	if output, err := startCmd.CombinedOutput(); err != nil {
		logger.Error("Failed to start service: %s", output)
		return fmt.Errorf("failed to start service: %w\nOutput: %s", err, output)
	}

	// Check if the service is running
	statusCmd := exec.Command("sudo", "service", serviceName, "status")
	if output, err := statusCmd.CombinedOutput(); err != nil {
		logger.Debug("Service status:\n%s", output)
		logger.Error("Service is not active")
		return fmt.Errorf("service is not active: %w", err)
	}

	return nil
}

// StartOpenRC starts an OpenRC service
//
// Parameters:
//   - serviceName: The name of the OpenRC service to start
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
func StartOpenRC(serviceName string) error {
	startCmd := exec.Command("sudo", "rc-service", serviceName, "start")
	if output, err := startCmd.CombinedOutput(); err != nil {
		logger.Error("Failed to start service: %s", output)
		return fmt.Errorf("failed to start service: %w\nOutput: %s", err, output)
	}

	// Check if the service is running
	statusCmd := exec.Command("sudo", "rc-service", serviceName, "status")
	if output, err := statusCmd.CombinedOutput(); err != nil {
		logger.Debug("Service status:\n%s", output)
		logger.Error("Service is not active")
		return fmt.Errorf("service is not active: %w", err)
	}

	return nil
}

// StopLinux stops a service on Linux systems.
// It detects whether to use systemd or sysvinit based on the service location.
//
// Parameters:
//   - serviceName: The name of the service to stop
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
func StopLinux(serviceName string) error {
	if IsSystemd() && IsInstalledSystemd(serviceName) {
		return StopSystemd(serviceName)
	} else if IsSysVInit() && IsInstalledSysVInit(serviceName) {
		return StopSysVInit(serviceName)
	} else if IsOpenRC() && IsInstalledSysVInit(serviceName) {
		return StopOpenRC(serviceName)
	}
	logger.Error("No supported init system found or service not installed")
	return fmt.Errorf("no supported init system found or service not installed")
}

// StopSystemd stops a systemd service
//
// Parameters:
//   - serviceName: The name of the systemd service to stop
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
func StopSystemd(serviceName string) error {
	stopCmd := exec.Command("sudo", "systemctl", "stop", serviceName)
	if output, err := stopCmd.CombinedOutput(); err != nil {
		logger.Error("Failed to stop service: %s", output)
		return fmt.Errorf("failed to stop service: %w\nOutput: %s", err, output)
	}
	return nil
}

// StopSysVInit stops a sysvinit service
//
// Parameters:
//   - serviceName: The name of the sysvinit service to stop
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
func StopSysVInit(serviceName string) error {
	stopCmd := exec.Command("sudo", "service", serviceName, "stop")
	if output, err := stopCmd.CombinedOutput(); err != nil {
		logger.Error("Failed to stop service: %s", output)
		return fmt.Errorf("failed to stop service: %w\nOutput: %s", err, output)
	}
	return nil
}

// StopOpenRC stops an OpenRC service
//
// Parameters:
//   - serviceName: The name of the OpenRC service to stop
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
func StopOpenRC(serviceName string) error {
	stopCmd := exec.Command("sudo", "rc-service", serviceName, "stop")
	if output, err := stopCmd.CombinedOutput(); err != nil {
		logger.Error("Failed to stop service: %s", output)
		return fmt.Errorf("failed to stop service: %w\nOutput: %s", err, output)
	}
	return nil
}

// UninstallLinux removes a service from a Linux system.
// It detects whether to use systemd or sysvinit based on the service location.
//
// Parameters:
//   - serviceName: the name of the service to uninstall
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
func UninstallLinux(serviceName string) error {
	// Try each supported init system, logging results appropriately
	if IsSystemd() {
		logger.Debug("Attempting systemd service removal...")
		if err := UninstallSystemd(serviceName); err != nil {
			// Check if this was a "not found" error or actual failure
			if !IsInstalledSystemd(serviceName) {
				logger.Info("Systemd service %s was not installed, skipping", serviceName)
			} else {
				logger.Error("Failed to remove systemd service: %v", err)
				return err
			}
		} else {
			logger.Debug("Systemd service successfully removed")
			return nil
		}
	}

	if IsSysVInit() {
		logger.Debug("Attempting SysVInit service removal...")
		if err := UninstallSysVInit(serviceName); err != nil {
			// Check if this was a "not found" error or actual failure
			if !IsInstalledSysVInit(serviceName) {
				logger.Info("SysVInit service %s was not installed, skipping", serviceName)
			} else {
				logger.Error("Failed to remove SysVInit service: %v", err)
				return err
			}
		} else {
			logger.Debug("SysVInit service successfully removed")
			return nil
		}
	}

	if IsOpenRC() {
		logger.Debug("Attempting OpenRC service removal...")
		if err := UninstallOpenRC(serviceName); err != nil {
			// Check if this was a "not found" error or actual failure
			if !IsInstalledSysVInit(serviceName) { // OpenRC uses same check as SysVInit
				logger.Info("OpenRC service %s was not installed, skipping", serviceName)
			} else {
				logger.Error("Failed to remove OpenRC service: %v", err)
				return err
			}
		} else {
			logger.Debug("OpenRC service successfully removed")
			return nil
		}
	}

	logger.Info("No supported init system found or service was not installed on any system")
	return nil // Changed from error to nil - not finding service to remove is not an error
}

// UninstallSystemd removes a systemd service
// The function stops the service, disables it, removes the service file,
// and reloads the systemd daemon.
//
// Parameters:
//   - serviceName: the name of the systemd service to uninstall
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
func UninstallSystemd(serviceName string) error {
	_ = StopSystemd(serviceName)

	disableCmd := exec.Command("sudo", "systemctl", "disable", serviceName)
	_ = disableCmd.Run()

	serviceFilePath := "/etc/systemd/system/" + serviceName + ".service"

	// Check if service file exists before attempting removal
	if _, err := os.Stat(serviceFilePath); err != nil {
		if os.IsNotExist(err) {
			logger.Debug("Systemd service file %s does not exist, skipping removal", serviceFilePath)
		} else {
			logger.Error("Failed to check service file status: %v", err)
			return fmt.Errorf("failed to check service file status: %w", err)
		}
	} else {
		// File exists, attempt to remove it
		rmCmd := exec.Command("sudo", "rm", "-f", serviceFilePath)
		if output, err := rmCmd.CombinedOutput(); err != nil {
			logger.Error("Failed to remove service file: %s", output)
			return fmt.Errorf("failed to remove service file: %w\nOutput: %s", err, output)
		}
		logger.Debug("Systemd service file removed successfully")
	}

	reloadCmd := exec.Command("sudo", "systemctl", "daemon-reload")
	if output, err := reloadCmd.CombinedOutput(); err != nil {
		logger.Error("Failed to reload systemd: %s", output)
		return fmt.Errorf("failed to reload systemd: %w\nOutput: %s", err, output)
	}

	return nil
}

// UninstallSysVInit removes a sysvinit service
// The function stops the service, disables it, removes the service script,
// and reloads the init system.
//
// Parameters:
//   - serviceName: the name of the sysvinit service to uninstall
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
func UninstallSysVInit(serviceName string) error {
	_ = StopSysVInit(serviceName)

	// Disable service using update-rc.d for Debian/Ubuntu or chkconfig for RedHat
	var disableCmd *exec.Cmd
	if _, err := exec.LookPath("update-rc.d"); err == nil {
		disableCmd = exec.Command("sudo", "update-rc.d", serviceName, "remove")
	} else if _, err := exec.LookPath("chkconfig"); err == nil {
		disableCmd = exec.Command("sudo", "chkconfig", "--del", serviceName)
	}

	if disableCmd != nil {
		_ = disableCmd.Run()
	}

	serviceFilePath := "/etc/init.d/" + serviceName

	// Check if service script exists before attempting removal
	if _, err := os.Stat(serviceFilePath); err != nil {
		if os.IsNotExist(err) {
			logger.Debug("SysVInit service script %s does not exist, skipping removal", serviceFilePath)
		} else {
			logger.Error("Failed to check service script status: %v", err)
			return fmt.Errorf("failed to check service script status: %w", err)
		}
	} else {
		// File exists, attempt to remove it
		rmCmd := exec.Command("sudo", "rm", "-f", serviceFilePath)
		if output, err := rmCmd.CombinedOutput(); err != nil {
			logger.Error("Failed to remove service script: %s", output)
			return fmt.Errorf("failed to remove service script: %w\nOutput: %s", err, output)
		}
		logger.Debug("SysVInit service script removed successfully")
	}

	return nil
}

// UninstallOpenRC removes an OpenRC service from the system.
// The function stops the service, removes it from OpenRC, and deletes the service script.
//
// Parameters:
//   - serviceName: the name of the OpenRC service to uninstall
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
func UninstallOpenRC(serviceName string) error {
	_ = StopOpenRC(serviceName)

	// Try to remove service from OpenRC registry - ignore errors as service might not be registered
	rmServiceCmd := exec.Command("sudo", "rc-update", "del", serviceName)
	if output, err := rmServiceCmd.CombinedOutput(); err != nil {
		logger.Debug("OpenRC service %s was not registered or removal failed: %s", serviceName, output)
		// Continue - this is not a fatal error, service script might still exist
	} else {
		logger.Debug("OpenRC service removed from registry successfully")
	}

	serviceFilePath := "/etc/init.d/" + serviceName

	// Check if service script exists before attempting removal
	if _, err := os.Stat(serviceFilePath); err != nil {
		if os.IsNotExist(err) {
			logger.Debug("OpenRC service script %s does not exist, skipping removal", serviceFilePath)
		} else {
			logger.Error("Failed to check service script status: %v", err)
			return fmt.Errorf("failed to check service script status: %w", err)
		}
	} else {
		// File exists, attempt to remove it
		rmCmd := exec.Command("sudo", "rm", "-f", serviceFilePath)
		if output, err := rmCmd.CombinedOutput(); err != nil {
			logger.Error("Failed to remove OpenRC service script: %s", output)
			return fmt.Errorf("failed to remove OpenRC service script: %w\nOutput: %s", err, output)
		}
		logger.Debug("OpenRC service script removed successfully")
	}

	return nil
}

// IsInstalledLinux checks if a service is installed on a Linux system.
// It checks both systemd and sysvinit locations.
//
// Parameters:
//   - serviceName: the name of the service to check for
//
// Returns:
//   - true if the service is installed
//   - false if the service is not installed
func IsInstalledLinux(serviceName string) bool {
	return IsInstalledSystemd(serviceName) || IsInstalledSysVInit(serviceName)
}

// IsInstalledSystemd checks if a systemd service is installed
//
// Parameters:
//   - serviceName: the name of the systemd service to check for
//
// Returns:
//   - true if the service is installed
//   - false if the service is not installed
func IsInstalledSystemd(serviceName string) bool {
	serviceFilePath := "/etc/systemd/system/" + serviceName + ".service"
	_, err := os.Stat(serviceFilePath)
	return err == nil
}

// IsInstalledSysVInit checks if a sysvinit service is installed
//
// Parameters:
//   - serviceName: the name of the sysvinit service to check for
//
// Returns:
//   - true if the service is installed
//   - false if the service is not installed
func IsInstalledSysVInit(serviceName string) bool {
	serviceFilePath := "/etc/init.d/" + serviceName
	_, err := os.Stat(serviceFilePath)
	return err == nil
}
