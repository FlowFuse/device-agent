//go:build windows

package utils

import "golang.org/x/sys/windows"

// diskFreeBytes returns bytes available to the calling user on the filesystem containing path.
//
// Parameters:
//  - path: the file system path to check
//
// Returns:
//  - uint64: number of free bytes available to the calling user
//  - error: non-nil if an error occurred while checking the filesystem
// Note: this function is implemented for Windows systems.
func diskFreeBytes(path string) (uint64, error) {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return 0, err
	}
	var freeToCaller, _total, _totalFree uint64
	if err := windows.GetDiskFreeSpaceEx(p, &freeToCaller, &_total, &_totalFree); err != nil {
		return 0, err
	}
	return freeToCaller, nil
}
