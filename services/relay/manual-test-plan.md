
# Manual Test Plan

## Integration Tests with komodo-unity

### Capture feature — Pressing spectator mode capture button should produce a correct capture file

* Steps
	* Join session (room) with two different clients
	* Open instructor menu and press capture button to start capture
	* Do some actions with one or both clients
	* Press end capture on the first client
* Expected result
	* Relay server should say “capture started with correct session ID”
	* Relay server should say “capture ended with correct session ID”
	* Capture file should have all of the correct actions
	* Capture file should have correct metadata 

### Capture feature — Pressing spectator mode capture button with unsynced states should only start capture once

* Steps
	* Try to start capture on one client
	* Try to start capture on other client
* Expected result
	* first client begins capture — relay server says “capture started” with correct session ID
	* Relay server should warn that a second client tried to start a capture when it was already running

### Capture feature — Pressing spectator mode capture button with unsynced states should only end capture once

* Steps
	* When a capture is running, end capture on one client
	* then do some actions on a different client
	* Then end the capture on that different client
* Expected result
	* Capture should only include actions done before first client ended capture
	* Relay server should warn that a second client tried to start a capture when it was already running
