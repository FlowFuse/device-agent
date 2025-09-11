//go:build linux || darwin

package utils

import "golang.org/x/sys/unix"

// diskFreeBytes returns bytes available to the calling user on the filesystem containing path.
//
// Parameters:
//  - path: the file system path to check
//
// Returns:
//  - uint64: number of free bytes available to the calling user
//  - error: non-nil if an error occurred while checking the filesystem
// Note: this function is implemented for Unix-like systems (Linux, macOS).
func diskFreeBytes(path string) (uint64, error) {
	var st unix.Statfs_t
	if err := unix.Statfs(path, &st); err != nil {
		return 0, err
	}
	bsize := uint64(st.Bsize)
	if bsize == 0 {
		bsize = 1
	}
	return uint64(st.Bavail) * bsize, nil
}
