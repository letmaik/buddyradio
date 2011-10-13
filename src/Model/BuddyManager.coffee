class Model.BuddyManager
	constructor: (@buddyNetworks) ->
	buddies: []
	storageKey: "buddyRadio_Buddies"
	eventListeners: []
	
	getBuddy: (buddyNetworkClassName, username) ->
		@buddies.filter((buddy) -> buddy.network.className == buddyNetworkClassName and buddy.username == username)[0]
	
	addBuddy: (buddyNetworkClassName, username, dontSave = false) ->
		if @buddies.some((buddy) -> buddy.network.className == buddyNetworkClassName and buddy.username == username)
			console.debug("user #{username} is already added")
			return
		console.debug("adding #{buddyNetworkClassName} user #{username}")
		
		network = @_findBuddyNetwork(buddyNetworkClassName)
		if network.isValid(username)
			buddy = new Model.Buddy(network, username)
			buddy.registerListener((name, data) => @_handleBuddyEvent(buddy, name, data))
			@buddies.push(buddy)
			if not dontSave
				@saveLocal()
			console.info("user #{username} added, informing listeners")
			listener("buddyAdded", buddy) for listener in @eventListeners
		else
			console.info("user #{username} not found")
			listener("buddyNotAdded", {username, reason: "notFound"}) for listener in @eventListeners
			
	removeBuddy: (buddyToBeRemoved) ->
		@buddies = @buddies.filter((buddy) -> buddy != buddyToBeRemoved)
		buddyToBeRemoved.dispose()
		@saveLocal()
		console.info("user #{buddyToBeRemoved.username} removed, informing listeners")
		listener("buddyRemoved", buddyToBeRemoved) for listener in @eventListeners
		
	importBuddies: (buddyNetworkClassName, username) ->
		network = @_findBuddyNetwork(buddyNetworkClassName)
		buddies = network.getBuddies(username)
		if buddies.error
			buddies
		else
			@addBuddy(buddyNetworkClassName, username, true) for username in buddies
			@saveLocal()
			true
		
	saveLocal: () -> 
		console.debug("saving buddies")
		reducedBuddies = ([buddy.network.className, buddy.username] for buddy in @buddies)
		localStorage[@storageKey] = JSON.stringify(reducedBuddies)
		listener("buddiesSaved") for listener in @eventListeners
	
	
	# TODO don't delete a buddy just because network failed (check for real not-found error!)
	loadLocal: () ->
		reducedBuddies = JSON.parse(localStorage[@storageKey] or "[]")
		@addBuddy(reducedBuddy[0], reducedBuddy[1], true) for reducedBuddy in reducedBuddies
		@saveLocal()
		listener("buddiesLoaded") for listener in @eventListeners
	
	registerListener: (listener) ->
		@eventListeners.push(listener)
		
	_handleBuddyEvent: (buddy, name, data) =>
		if ["statusChanged", "lastSongChanged"].indexOf(name) != -1
			listener(name, {buddy, data}) for listener in @eventListeners
			
	_findBuddyNetwork: (networkClassName) ->
		@buddyNetworks.filter((network) -> network.className == networkClassName)[0]