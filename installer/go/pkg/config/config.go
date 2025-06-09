package config

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/flowfuse/device-agent-installer/pkg/logger"
	"github.com/flowfuse/device-agent-installer/pkg/utils"
)

// InstallerConfig holds the configuration for the installer
type InstallerConfig struct {
	ServiceUsername string `json:"serviceUsername"`
	AgentVersion    string `json:"agentVersion"`
	NodeVersion		 string `json:"nodeVersion"`
}

// GetConfigPath returns the path to the installer configuration file.
// It first retrieves the working directory using utils.GetWorkingDirectory()
// and then appends "installer.conf" to form the complete path.
// If retrieving the working directory fails, it returns an empty string and an error.
func GetConfigPath() (string, error) {
	workDir, err := utils.GetWorkingDirectory()
	if err != nil {
		return "", fmt.Errorf("failed to get working directory: %w", err)
	}

	return filepath.Join(workDir, "installer.conf"), nil
}

// SaveConfig writes the provided installer configuration to the config file.
// It first attempts to write the file directly, and if that fails (typically due
// to permission issues), it creates a temporary file and uses sudo to move it
// to the correct location, then attempts to set appropriate ownership and permissions.
//
// The config is saved in JSON format with indentation.
//
// Parameters:
//   - cfg: The InstallerConfig to be saved
//
// Returns:
//   - error: nil if successful, otherwise an error detailing what went wrong
func SaveConfig(cfg *InstallerConfig) error {
	configPath, err := GetConfigPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	// Try to write the file directly first
	err = os.WriteFile(configPath, data, 0644)
	if err == nil {
		return nil 
	}

	tempDir := os.TempDir()
	tempFile := filepath.Join(tempDir, "flowfuse-installer-config.tmp")

	if err := os.WriteFile(tempFile, data, 0644); err != nil {
		return fmt.Errorf("failed to write temporary config file: %w", err)
	}

	mvCmd := exec.Command("sudo", "mv", tempFile, configPath)
	if output, err := mvCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to move config file: %w\nOutput: %s", err, output)
	}

	chownCmd := exec.Command("sudo", "chown", utils.ServiceUsername, configPath)
	if output, err := chownCmd.CombinedOutput(); err != nil {
		logger.Info("Warning: Could not set ownership of config file: %s\nOutput: %s", err, output)
	}

	chmodCmd := exec.Command("sudo", "chmod", "644", configPath)
	if output, err := chmodCmd.CombinedOutput(); err != nil {
		logger.Info("Warning: Could not set permissions on config file: %s\nOutput: %s", err, output)
	}

	return nil
}

// LoadConfig loads the installer configuration from the default configuration path.
//
// It first attempts to get the path to the configuration file using GetConfigPath().
// If the configuration file doesn't exist, it returns a default configuration with
// the ServiceUsername set to the predefined utils.ServiceUsername value.
// If the file exists, it reads and parses the JSON content into an InstallerConfig struct.
//
// Returns:
//   - *InstallerConfig: The loaded configuration or default if file doesn't exist
//   - error: An error if the config path cannot be determined, the file cannot be read,
//     or the JSON content cannot be parsed
func LoadConfig() (*InstallerConfig, error) {
	configPath, err := GetConfigPath()
	if err != nil {
		return nil, err
	}

	// If the config file doesn't exist, return default config
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return &InstallerConfig{
			ServiceUsername: utils.ServiceUsername,
		}, nil
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var cfg InstallerConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	return &cfg, nil
}
