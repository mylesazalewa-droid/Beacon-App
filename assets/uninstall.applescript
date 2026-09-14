-- ──────────────────────────────────────────────────────────────
-- Beacon Uninstaller
-- Safely moves Beacon and its data to the macOS Trash.
-- ──────────────────────────────────────────────────────────────

set appPath to "/Applications/Beacon.app"
set appInstalled to false

try
	set testAlias to (POSIX file appPath as alias)
	set appInstalled to true
end try

-- ── Not installed ─────────────────────────────────────────────
if not appInstalled then
	display dialog "Beacon does not appear to be installed in /Applications." & return & return & "Nothing was changed." buttons {"OK"} default button "OK" with icon caution with title "Beacon Uninstaller"
	return
end if

-- ── Choose removal level ──────────────────────────────────────
set choice to button returned of (display dialog "Uninstall Beacon from your Mac?" & return & return & "Remove App Only — moves Beacon.app to Trash. Your photo library stays on disk." & return & return & "Remove Everything — also removes the database, thumbnails, and Python environment (~500 MB)." buttons {"Cancel", "Remove App Only", "Remove Everything"} default button "Remove App Only" with icon caution with title "Beacon Uninstaller")

if choice is "Cancel" then return

set removeData to (choice is "Remove Everything")

-- ── Extra confirm for full removal ────────────────────────────
if removeData then
	set confirmFull to button returned of (display dialog "This will move to Trash:" & return & "  • Beacon.app" & return & "  • beacon_data  (database & thumbnails)" & return & "  • beacon_venv  (Python environment)" & return & "  • Beacon logs and preferences" & return & return & "You can recover from Trash before emptying it." buttons {"Cancel", "Yes, Remove Everything"} default button "Cancel" with icon stop with title "Beacon Uninstaller")
	if confirmFull is "Cancel" then return
end if

-- ── Move app to Trash ─────────────────────────────────────────
set removedCount to 0

try
	tell application "Finder" to move (POSIX file appPath as alias) to trash
	set removedCount to removedCount + 1
on error moveErr
	display dialog "Could not move Beacon.app to Trash." & return & return & "Error: " & moveErr & return & return & "Try dragging it to Trash manually." buttons {"OK"} default button "OK" with icon stop with title "Beacon Uninstaller"
	return
end try

-- ── Move data folders (optional) ─────────────────────────────
if removeData then
	set supportDir to POSIX path of (path to application support folder from user domain)
	set libDir to POSIX path of (path to library folder from user domain)

	set pathsToTrash to {¬
		supportDir & "beacon_data", ¬
		supportDir & "beacon_venv", ¬
		supportDir & "Beacon", ¬
		supportDir & "com.beacon.app", ¬
		libDir & "Logs/Beacon", ¬
		libDir & "Preferences/com.beacon.app.plist"}

	tell application "Finder"
		repeat with thePath in pathsToTrash
			set pathStr to thePath as string
			try
				set theAlias to (POSIX file pathStr as alias)
				move theAlias to trash
				set removedCount to removedCount + 1
			end try
		end repeat
	end tell
end if

-- ── Done ──────────────────────────────────────────────────────
set msg to "Beacon has been uninstalled." & return & return
if removeData then
	set msg to msg & removedCount & " items moved to Trash." & return & "Empty your Trash to fully free up disk space."
else
	set msg to msg & "Beacon.app has been moved to Trash." & return & "Your photo library and data are still on disk."
end if

display dialog msg buttons {"Done"} default button "Done" with icon note with title "Beacon Uninstaller"
