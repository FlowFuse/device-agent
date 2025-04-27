package service

import (
	"fmt"
	"os"
	"os/exec"
	"text/template"

	"github.com/flowfuse/device-agent-installer/pkg/logger"
	"github.com/flowfuse/device-agent-installer/pkg/nodejs"
	"github.com/flowfuse/device-agent-installer/pkg/utils"
)

// ServiceConfig holds the data for the service template
type ServiceConfig struct {
	User       string
	WorkDir    string
	NodeBinDir string
}

// InstallLinux creates and installs a systemd service on Linux systems.
//
// The function checks if systemd is available, creates a service configuration,
// generates a service file from a template, and installs it using systemd commands.
// It also sets appropriate permissions, enables the service to start on boot,
// and starts the service.
//
// Parameters:
//   - serviceName: the name of the systemd service to create
//   - workDir: the working directory for the service
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
//
// The function requires sudo privileges to:
//   - Copy the service file to /etc/systemd/system/
//   - Set permissions on the service file
//   - Reload the systemd daemon
//   - Enable and start the service
func InstallLinux(serviceName, workDir string) error {
	if _, err := exec.LookPath("systemctl"); err != nil {
		logger.Error("systemd is not available on this system")
		return fmt.Errorf("systemd is not available on this system")
	}

	config := ServiceConfig{
		User:       utils.ServiceUsername,
		WorkDir:    workDir,
		NodeBinDir: nodejs.GetNodeBinDir(),
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

	if err := StartLinux(serviceName); err != nil {
		return err
	}

	return nil
}

// StartLinux attempts to start a systemd service with the given serviceName on Linux systems.
// It uses systemctl commands to start the service and verify that it is active.
//
// The function executes the following steps:
// 1. Runs 'sudo systemctl start serviceName' to start the service
// 2. Verifies the service is active with 'sudo systemctl is-active --quiet serviceName'
// 3. If the service is not active, it collects and logs the full status output
//
// Parameters:
//   - serviceName: The name of the systemd service to start
//
// Returns:
//   - error: nil if the service starts successfully and is active,
//            otherwise returns an error with details about the failure
func StartLinux(serviceName string) error {
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

// StopLinux stops a systemd service on Linux systems.
// It uses the systemctl command with sudo to stop the specified service.
//
// Parameters:
//   - serviceName: The name of the systemd service to stop
//
// Returns:
//   - error: nil if the service was successfully stopped,
//            an error with the command output if the stop operation failed
func StopLinux(serviceName string) error {
	stopCmd := exec.Command("sudo", "systemctl", "stop", serviceName)
	if output, err := stopCmd.CombinedOutput(); err != nil {
		logger.Error("Failed to stop service: %s", output)
		return fmt.Errorf("failed to stop service: %w\nOutput: %s", err, output)
	}
	return nil
}

// UninstallLinux removes a systemd service from a Linux system.
// It performs the following steps:
// 1. Attempts to stop the service (ignoring any errors)
// 2. Disables the service in systemd
// 3. Removes the service file from /etc/systemd/system/
// 4. Reloads the systemd daemon configuration
//
// Parameters:
//   - serviceName: the name of the service to uninstall (without the .service extension)
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
//     during the removal of the service file or daemon reload
//
// Note: This function requires sudo privileges as it runs commands with sudo.
func UninstallLinux(serviceName string) error {
	_ = StopLinux(serviceName)

	disableCmd := exec.Command("sudo", "systemctl", "disable", serviceName)
	_ = disableCmd.Run()

	serviceFilePath := "/etc/systemd/system/" + serviceName + ".service"
	rmCmd := exec.Command("sudo", "rm", "-f", serviceFilePath)
	if output, err := rmCmd.CombinedOutput(); err != nil {
		logger.Error("Failed to remove service file: %s", output)
		return fmt.Errorf("failed to remove service file: %w\nOutput: %s", err, output)
	}

	reloadCmd := exec.Command("sudo", "systemctl", "daemon-reload")
	if output, err := reloadCmd.CombinedOutput(); err != nil {
		logger.Error("Failed to reload systemd: %s", output)
		return fmt.Errorf("failed to reload systemd: %w\nOutput: %s", err, output)
	}

	return nil
}

// IsInstalledLinux checks if a systemd service is installed on a Linux system.
// It verifies the existence of the service file in the systemd directory.
//
// Parameters:
//   - serviceName: the name of the service to check for
//
// Returns:
//   - true if the service is installed (service file exists)
//   - false if the service is not installed (service file doesn't exist)
func IsInstalledLinux(serviceName string) bool {
	serviceFilePath := "/etc/systemd/system/" + serviceName + ".service"
	_, err := os.Stat(serviceFilePath)
	return err == nil
}
