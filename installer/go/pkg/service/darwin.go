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

// LaunchdConfig holds the data for the launchd template
type LaunchdConfig struct {
	Label      string
	WorkDir    string
	LogFile    string
	ErrorFile  string
	User       string
	NodeBinDir string
}

// newsyslogConfig holds the data for the newsyslog configuration
type newsyslogConfig struct {
	LogFile   string
	ErrorFile string
	User      string
}

// Global variables
const serviceLabel = "com.flowfuse.device-agent"
const serviceFilePath = "/Library/LaunchDaemons/" + serviceLabel + ".plist"

// InstallDarwin installs the service on macOS using launchd
// It creates a plist file in the LaunchDaemons directory and sets the necessary permissions
// It also creates a log directory for the service
//
// Parameters:
//   - workDir: The working directory where the service will operate
//
// Returns:
//   - error: nil if successful, otherwise an error explaining what went wrong
func InstallDarwin(workDir string) error {
	serviceUser := utils.ServiceUsername

	// Create the log directory
	logDir := filepath.Join(workDir, "logs")
	mkdirCmd := exec.Command("sudo", "mkdir", "-p", logDir)
	if output, err := mkdirCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to create directory %s: %w\nOutput: %s", logDir, err, output)
	}
	logger.Debug("Setting ownership of %s to %s...", logDir, serviceUser)
	chownCmd := exec.Command("sudo", "chown", "-R", serviceUser, logDir)
	if output, err := chownCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set logs directory ownership: %w\nOutput: %s", err, output)
	}

	logFilePath := filepath.Join(logDir, "flowfuse-device-agent.log")
	errorLogFilePath := filepath.Join(logDir, "flowfuse-device-agent-error.log")

	config := LaunchdConfig{
		Label:      serviceLabel,
		WorkDir:    workDir,
		LogFile:    logFilePath,
		ErrorFile:  errorLogFilePath,
		User:       serviceUser,
		NodeBinDir: nodejs.GetNodeBinDir(),
	}

	tmpl, err := template.New("launchd").Parse(launchdTemplate)
	if err != nil {
		return fmt.Errorf("failed to parse launchd template: %w", err)
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

	copyCmd := exec.Command("sudo", "cp", "-X", tmpFile.Name(), serviceFilePath)
	if output, err := copyCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to copy service file: %w\nOutput: %s", err, output)
	}

	chownCmd = exec.Command("sudo", "chown", "root:wheel", serviceFilePath)
	if output, err := chownCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set service file ownership: %w\nOutput: %s", err, output)
	}

	chmodCmd := exec.Command("sudo", "chmod", "644", serviceFilePath)
	if err := chmodCmd.Run(); err != nil {
		return fmt.Errorf("failed to set service file permissions: %w", err)
	}

	loadCmd := exec.Command("sudo", "launchctl", "load", "-w", serviceFilePath)
	if output, err := loadCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to load launchd service: %w\nOutput: %s", err, output)
	}

	createNewsyslogConfig(serviceUser, logFilePath, errorLogFilePath)

	return nil
}

// StartDarwin starts the service on macOS
// It uses launchctl to start the service and checks its status
//
// Returns:
//   - error: nil if successful, otherwise an error explaining what went wrong
func StartDarwin() error {
	startCmd := exec.Command("sudo", "launchctl", "start", serviceLabel)
	if output, err := startCmd.CombinedOutput(); err != nil {
		logger.Error("Failed to start service: %s", err)
		return fmt.Errorf("failed to start service: %w\nOutput: %s", err, output)
	}

	listCmd := exec.Command("launchctl", "list", serviceLabel)
	listOutput, _ := listCmd.CombinedOutput()
	logger.Debug("Service status:\n%s", listOutput)

	return nil
}

// StopDarwin stops the service on macOS
// It uses launchctl to stop the service
//
// Returns:
//   - error: nil if successful, otherwise an error explaining what went wrong
func StopDarwin() error {
	stopCmd := exec.Command("sudo", "launchctl", "stop", serviceLabel)
	if output, err := stopCmd.CombinedOutput(); err != nil {
		logger.Error("Failed to stop service: %s", err)
		return fmt.Errorf("failed to stop service: %w\nOutput: %s", err, output)
	}
	return nil
}

// UninstallDarwin removes the service on macOS
// It stops and unloads the service using launchctl and removes the plist file
//
// Returns:
//   - error: nil if successful, otherwise an error explaining what went wrong
func UninstallDarwin() error {
	// Always attempt to stop the service first (ignore errors)
	_ = StopDarwin()

	// Attempt to unload the service (ignore errors - service might not be loaded)
	unloadCmd := exec.Command("sudo", "launchctl", "unload", "-w", serviceFilePath)
	_ = unloadCmd.Run()

	// Check if service file exists before attempting removal
	if _, err := os.Stat(serviceFilePath); err != nil {
		if os.IsNotExist(err) {
			logger.Debug("Darwin service file %s does not exist, skipping removal", serviceFilePath)
		} else {
			logger.Error("Failed to check service file status: %v", err)
			return fmt.Errorf("failed to check service file status: %w", err)
		}
	} else {
		// Service file exists, attempt to remove it
		removeCmd := exec.Command("sudo", "rm", "-f", serviceFilePath)
		if output, err := removeCmd.CombinedOutput(); err != nil {
			logger.Error("Failed to remove service file: %s", output)
			return fmt.Errorf("failed to remove service file: %w\nOutput: %s", err, output)
		}
		logger.Debug("Darwin service file removed successfully")
	}

	// Check if newsyslog configuration file exists before attempting removal
	nsConfFilePath := filepath.Join("/etc/newsyslog.d/", fmt.Sprintf("%s.conf", serviceLabel))
	if _, err := os.Stat(nsConfFilePath); err != nil {
		if os.IsNotExist(err) {
			logger.Debug("Darwin newsyslog configuration file %s does not exist, skipping removal", nsConfFilePath)
		} else {
			logger.Error("Failed to check newsyslog configuration file status: %v", err)
			return fmt.Errorf("failed to check newsyslog configuration file status: %w", err)
		}
	} else {
		// Configuration file exists, attempt to remove it
		removeCmd := exec.Command("sudo", "rm", "-rf", nsConfFilePath)
		if output, err := removeCmd.CombinedOutput(); err != nil {
			logger.Error("Failed to remove newsyslog configuration file: %s", output)
			return fmt.Errorf("failed to remove newsyslog configuration file: %w\nOutput: %s", err, output)
		}
		logger.Debug("Darwin newsyslog configuration file removed successfully")
	}

	return nil
}

// IsInstalledDarwin checks if the service is installed on macOS
// It checks if the service is running and if the plist file exists
//
// Returns:
//   - bool: true if the service is installed, false otherwise
func IsInstalledDarwin() bool {
	listCmd := exec.Command("sudo", "launchctl", "list", serviceLabel)
	// Check if service is running
	serviceRunning := listCmd.Run() == nil

	// Check if service file exists
	_, err := os.Stat(serviceFilePath)
	fileExists := err == nil

	return serviceRunning && fileExists
}

// createNewsyslogConfig creates a configuration file for the newsyslog service
// to manage log rotation for the FlowFuse Device Agent. It generates the configuration
// based on the provided service user, log file, and error file paths, then installs it
// in /etc/newsyslog.d/ with appropriate permissions.
//
// Parameters:
//   - serviceUser: The user under which the service runs
//   - logFile: Path to the main log file that needs rotation
//   - errorFile: Path to the error log file that needs rotation
//
// Returns:
//   - error: An error if any step in the process fails, nil on success
func createNewsyslogConfig(serviceUser, logFile, errorFile string) error {
	logger.Debug("Creating log files rotation configuration for FlowFuse Device Agent...")

	nsDir := "/etc/newsyslog.d/"
	if _, err := os.Stat(nsDir); os.IsNotExist(err) {
		return fmt.Errorf("%s directory does not exist", nsDir)
	}

	confFilePath := filepath.Join(nsDir, fmt.Sprintf("%s.conf", serviceLabel))
	logger.Debug("Configuration file path: %s", confFilePath)
	config := newsyslogConfig{
		LogFile:   logFile,
		ErrorFile: errorFile,
		User:      serviceUser,
	}

	tmpl, err := template.New("newsyslog").Parse(newsyslogTemplate)
	if err != nil {
		return fmt.Errorf("failed to parse newsyslog template: %w", err)
	}

	tmpFile, err := os.CreateTemp("", "flowfuse-device-agent-ns-conf-")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	defer os.Remove(tmpFile.Name())

	if err := tmpl.Execute(tmpFile, config); err != nil {
		return fmt.Errorf("failed to execute nsconf template: %w", err)
	}
	tmpFile.Close()

	copyCmd := exec.Command("sudo", "cp", "-X", tmpFile.Name(), confFilePath)
	if output, err := copyCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to copy nsconf file: %w\nOutput: %s", err, output)
	}

	chownCmd := exec.Command("sudo", "chown", "root:wheel", confFilePath)
	if output, err := chownCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to set nsconf file ownership: %w\nOutput: %s", err, output)
	}

	chmodCmd := exec.Command("sudo", "chmod", "644", confFilePath)
	if err := chmodCmd.Run(); err != nil {
		return fmt.Errorf("failed to set nsconf file permissions: %w", err)
	}

	logger.Debug("Log files rotation configuration created successfully at %s", confFilePath)
	return nil
}
