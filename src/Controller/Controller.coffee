Controller = {}

class Controller.Radio
	constructor: (@buddyNetworks, @streamingNetworks) ->
		@radio = new Model.Radio(@buddyNetworks, @streamingNetworks)
		@view = new View.BuddySidebarSection(@radio, @)
	
	start: () ->
		@radio.buddyManager.loadLocal()
		
	addBuddy: (networkClassName, username) ->
		if networkClassName and username
			@radio.buddyManager.addBuddy(networkClassName, username)
		
	removeBuddy: (networkClassName, username) ->
		if networkClassName and username
			@radio.buddyManager.removeBuddy(@radio.buddyManager.getBuddy(networkClassName, username))
			
	importBuddies: (networkClassName, username) ->
		if networkClassName and username
			@radio.buddyManager.importBuddies(networkClassName, username)
		
	tune: (networkClassName, username) ->
		if networkClassName and username
			@radio.tune(@radio.buddyManager.getBuddy(networkClassName, username))
			
	setSongsPerFeedInARow: (count) ->
		if count? and count > 0
			@radio.setSongsPerFeedInARow(count)