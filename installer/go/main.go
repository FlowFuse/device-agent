package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/flowfuse/device-agent-installer/cmd"
	"github.com/flowfuse/device-agent-installer/pkg/logger"
	"github.com/flowfuse/device-agent-installer/pkg/utils"
)

var (
	agentVersion        string
	flowfuseURL         string
	flowfuseOneTimeCode string
	nodeVersion         string
	serviceUsername     string
	uninstall           bool
	update              bool
	debugMode           bool
)

func init() {
	flag.StringVar(&nodeVersion, "node", "20.19.0", "Node.js version to install (minimum)")
	flag.StringVar(&agentVersion, "agent", "latest", "Device agent version to install")
	flag.StringVar(&serviceUsername, "user", "flowfuse", "Username for the service account")
	flag.StringVar(&flowfuseURL, "url", "https://app.flowfuse.com", "FlowFuse URL")
	flag.StringVar(&flowfuseOneTimeCode, "otc", "", "FlowFuse one time code for authentication (required)")
	flag.BoolVar(&uninstall, "uninstall", false, "Uninstall the device agent")
	flag.BoolVar(&update, "update", false, "Update the device agent")
	flag.BoolVar(&debugMode, "debug", false, "Enable debug logging")
	flag.Parse()

	if (!uninstall && !update && flowfuseOneTimeCode == "") {
		fmt.Println("[ERROR]: FlowFuse one time code is required for installation")
		fmt.Println("Usage:")
		flag.PrintDefaults()
		os.Exit(1)
	}
}

func main() {
	utils.ServiceUsername = serviceUsername

	exePath, err := os.Executable()
	if err != nil {
		fmt.Println("Error determining executable path:", err)
		os.Exit(1)
	}
	installerDir := filepath.Dir(exePath)

	// Initialize logger
	if err := logger.Initialize(debugMode); err != nil {
		fmt.Printf("Warning: Failed to initialize logger: %s\n", err)
	} else {
		defer logger.Close()
	}

	// Log startup information
	logger.Debug("Command line arguments: node=%s, agent=%s, user=%s, url=%s, debug=%v",
		nodeVersion, agentVersion, serviceUsername, flowfuseURL, debugMode)

	logger.Info("****************************************************************")
	logger.Info("*            FlowFuse Device Agent Installer                   *")
	logger.Info("*                                                              *")
	logger.Info("* This installer will set up the FlowFuse Device Agent on your *")
	logger.Info("* system and configure it to run as a system service.          *")
	logger.Info("*                                                              *")
	logger.Info("****************************************************************")

	if debugMode {
		logger.Info("Debug mode enabled. Logs will be written to: %s", logger.GetLogFilePath())
	}

	var exitCode int

	if uninstall {
		logger.Info("Uninstalling FlowFuse Device Agent...")
		err = cmd.Uninstall()
	} else if update {
		logger.Error("Update functionality is not yet implemented.")
	} else {
		logger.Info("Installing FlowFuse Device Agent...")

		err = cmd.Install(nodeVersion, agentVersion, installerDir, flowfuseURL, flowfuseOneTimeCode)
	}

	if err != nil {
		logger.Error("Installation failed: %s", err)
		exitCode = 1
	} else {
		exitCode = 0
	}

	os.Exit(exitCode)
}
