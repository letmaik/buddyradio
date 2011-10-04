class Model.BuddyManager
	constructor: (@buddyNetworks) ->
	buddies: []
	storageKey: "buddyRadio_Buddies"
	eventListeners: []
	
	getBuddy: (buddyNetworkClassName, username) ->
		@buddies.filter((buddy) -> buddy.network.className == buddyNetworkClassName and buddy.username == username)[0]
	
	addBuddy: (buddyNetworkClassName, username) ->
		if @buddies.some((buddy) -> buddy.network.className == buddyNetworkClassName and buddy.username == username)
			console.debug("user #{username} is already added")
			return
		console.debug("adding #{buddyNetworkClassName} user #{username}")
		
		network = @_findBuddyNetwork(buddyNetworkClassName)
		if network.isValid(username)
			buddy = new Model.Buddy(network, username)
			buddy.registerListener(@handleBuddyEvent)
			@buddies.push(buddy)
			@saveLocal()
			console.info("user #{username} added, informing listeners")
			listener("buddyAdded", buddy) for listener in @eventListeners
		else
			console.info("user #{username} not found")
			# TODO maybe inform listeners
			
	removeBuddy: (buddyToBeRemoved) ->
		@buddies = @buddies.filter((buddy) -> buddy != buddyToBeRemoved)
		buddyToBeRemoved.dispose()
		@saveLocal()
		console.info("user #{buddyToBeRemoved.username} removed, informing listeners")
		listener("buddyRemoved", buddyToBeRemoved) for listener in @eventListeners
					
	saveLocal: () -> 
		reducedBuddies = ([buddy.network.className, buddy.username] for buddy in @buddies)
		localStorage[@storageKey] = JSON.stringify(reducedBuddies)
		listener("buddiesSaved") for listener in @eventListeners
		
	loadLocal: () ->
		reducedBuddies = JSON.parse(localStorage[@storageKey] or "[]")
		@addBuddy(reducedBuddy[0], reducedBuddy[1]) for reducedBuddy in reducedBuddies
		listener("buddiesLoaded") for listener in @eventListeners
	
	registerListener: (listener) ->
		@eventListeners.push(listener)
		
	handleBuddyEvent: (name, data) =>
		if ["statusChanged", "lastSongChanged"].indexOf(name) != -1
			listener(name, data) for listener in @eventListeners
			
	_findBuddyNetwork: (networkClassName) ->
		@buddyNetworks.filter((network) -> network.className == networkClassName)[0]