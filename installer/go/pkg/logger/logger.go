// Package logger provides a configurable logging system with debug, info, and error levels.
//
// The logger supports both file and console output destinations, with each level
// having its own logger instance. The package is designed to be thread-safe and
// supports enabling/disabling debug logging.
//
// Log file management is handled internally, with operations for opening, closing,
// and configuring the log file path. All logging operations are protected by a mutex
// to ensure thread safety in concurrent environments.
package logger

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)


var (
	// Global debug flag
	debugEnabled bool

	// Logger instances for file output
	fileDebugLogger *log.Logger
	fileInfoLogger  *log.Logger
	fileErrorLogger *log.Logger

	// Logger instances for console output
	consoleDebugLogger *log.Logger
	consoleInfoLogger  *log.Logger
	consoleErrorLogger *log.Logger

	// Log file and path
	logFile *os.File
	logFilePath string

	// Mutex for thread safety
	mutex sync.Mutex
)


// Initialize sets up the logger system with file and console logging capabilities.
//
// The function creates a timestamped log file in the system's temporary directory
// and initializes multiple logger instances for different severity levels (debug, info, error)
// with appropriate formatting for both file and console output.
//
// The debug parameter controls whether debug-level logging is enabled.
//
// The function returns an error if it fails to create or open the log file.
// On successful initialization, it logs an initialization message and, if debug is enabled,
// logs the path to the detailed log file.
func Initialize(debug bool) error {
	mutex.Lock()

	debugEnabled = debug

	logDir := os.TempDir()

	timestamp := time.Now().Format("20060102-150405")
	logFilename := fmt.Sprintf("flowfuse-device-installer-%s.log", timestamp)
	logFilePath = filepath.Join(logDir, logFilename)

	var err error
	logFile, err = os.OpenFile(logFilePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		mutex.Unlock()
		return fmt.Errorf("failed to open log file: %w", err)
	}

	fileDebugLogger = log.New(logFile, "[DEBUG] ", log.Ldate|log.Ltime|log.Lshortfile)
	fileInfoLogger = log.New(logFile, "[INFO] ", log.Ldate|log.Ltime)
	fileErrorLogger = log.New(logFile, "[ERROR] ", log.Ldate|log.Ltime|log.Lshortfile)

	consoleDebugLogger = log.New(os.Stdout, "[DEBUG] ", 0)
	consoleInfoLogger = log.New(os.Stdout, "", 0)
	consoleErrorLogger = log.New(os.Stderr, "[ERROR] ", 0)

	mutex.Unlock()

	if debug {
		Debug("Debug logging enabled - detailed logs will be written to %s", logFilePath)
	}

	return nil
}

// Close safely closes the log file if one is open.
// It's synchronized with a mutex to prevent concurrent access issues.
// If the debug mode is enabled, it outputs a message before closing.
// Returns any error encountered during the file closing operation or nil if successful or if no file is open.
func Close() error {
	mutex.Lock()
	defer mutex.Unlock()

	if logFile != nil {
		if debugEnabled {
			fileDebugLogger.Output(2, "Closing log file")
		}
		return logFile.Close()
	}
	return nil
}

// Debug logs a debug message if debugging is enabled.
//
// The message is formatted according to the format specifier and the remaining arguments.
// If debug mode is enabled, the message is output to both the file debug logger and
// the console debug logger, if they are configured.
//
// Parameters:
//   - format: A format string as used in fmt.Printf.
//   - v: The values to be formatted.
func Debug(format string, v ...interface{}) {
	if !debugEnabled {
		return
	}

	mutex.Lock()
	defer mutex.Unlock()

	if fileDebugLogger != nil {
		fileDebugLogger.Output(2, fmt.Sprintf(format, v...))
	}

	if consoleDebugLogger != nil {
		consoleDebugLogger.Output(2, fmt.Sprintf(format, v...))
	}
}

// Info logs formatted informational messages.
// It writes the formatted message to both the file and console loggers if they are initialized.
// The message format follows the fmt.Sprintf convention.
// This function is thread-safe.
//
// Parameters:
//   - format: A format string that follows the fmt.Sprintf formatting rules.
//   - v: Variable arguments to be formatted according to the format string.
func Info(format string, v ...interface{}) {
	mutex.Lock()
	defer mutex.Unlock()

	message := fmt.Sprintf(format, v...)

	if fileInfoLogger != nil {
		fileInfoLogger.Output(2, message)
	}

	if consoleInfoLogger != nil {
		consoleInfoLogger.Output(2, message)
	}
}



// Error logs a formatted error message to both file and console loggers if they are initialized.
// It uses a mutex to ensure thread-safe logging operations.
//
// Parameters:
//   - format: A format string as per fmt.Sprintf
//   - v: Optional values to be formatted according to the format string
//
// The function writes the formatted message to the error file logger and console error logger
// if they are available, with a call depth of 2 to record the correct source file information.
func Error(format string, v ...interface{}) {
	mutex.Lock()
	defer mutex.Unlock()

	message := fmt.Sprintf(format, v...)

	if fileErrorLogger != nil {
		fileErrorLogger.Output(2, message)
	}

	if consoleErrorLogger != nil {
		consoleErrorLogger.Output(2, message)
	}
}

// LogFunctionEntry logs the entry point of a function with its parameters if debug logging is enabled.
// It creates a log entry with the prefix "ENTER:" followed by the function name and its parameters.
// If debug logging is disabled, this function returns without logging.
//
// Parameters:
//   - functionName: The name of the function being entered.
//   - params: A map containing parameter names and their values to be logged.
//
// Example:
//
//	LogFunctionEntry("MyFunction", map[string]interface{}{
//	    "id": 123,
//	    "name": "example",
//	})
func LogFunctionEntry(functionName string, params map[string]interface{}) {
	if !debugEnabled {
		return
	}

	Debug("ENTER: %s %v", functionName, params)
}


// LogFunctionExit logs the result of a function execution when debug is enabled.
// It takes the name of the function, the return value, and any error that occurred.
// If an error is provided, it logs that the function returned an error.
// Otherwise, it logs the function's result.
// This function is a no-op when debug logging is disabled.
func LogFunctionExit(functionName string, result interface{}, err error) {
	if !debugEnabled {
		return
	}

	if err != nil {
		Debug("EXIT: %s returned error: %v", functionName, err)
	} else {
		Debug("EXIT: %s completed with result: %v", functionName, result)
	}
}

// GetLogFilePath returns the current path of the log file.
// This function is thread-safe and uses a mutex to prevent concurrent access to the logFilePath variable.
func GetLogFilePath() string {
	mutex.Lock()
	defer mutex.Unlock()

	return logFilePath
}
