class Model.Radio
	constructor: (@buddyNetworks, @streamingNetworks) ->
		@buddyManager = new Model.BuddyManager(@buddyNetworks)
		@buddyManager.registerListener(@_handleBuddyManagerEvent)
		@currentStream = null
		@eventListeners = []
	
	onAirBuddy: null
	
	tune: (buddy) ->
		if @onAirBuddy == buddy
			@tuneOut()
		else
			@tuneOut()
			if buddy.listeningStatus == "disabled"
				listener("streamNotStarted", {buddy, reason: "disabled"}) for listener in @eventListeners
				return
			@onAirBuddy = buddy
			listener("streamStarted", buddy) for listener in @eventListeners
			@currentStream = new Model.SongFeedStream(buddy.getLiveFeed(), @streamingNetworks)
			# @currentStream.registerListener(@_handleSongFeedStreamEvent)
			buddyListener = (name, data) =>
				if name == "statusChanged" and data == "disabled"
					listener("streamStopped", {buddy, reason: "disabled"}) for listener in @eventListeners
					@tuneOut()
			buddy.registerListener(buddyListener)
			result = @currentStream.startStreaming()
			console.debug("stream returned: #{result.status}")
			buddy.removeListener(buddyListener)
			if result.status == "endOfFeed"
				listener("streamCompleted", buddy) for listener in @eventListeners
				console.info("stream completed")
			else if result.status == "stopRequest"
				listener("streamStopped", {buddy, reason: "request"}) for listener in @eventListeners
				console.info("stream stopped")
	
	tuneOut: () ->
		if @onAirBuddy?
			buddy = @onAirBuddy
			@onAirBuddy = null
			@currentStream.stopStreaming()
			@currentStream.dispose()
			@currentStream = null
		
	registerListener: (listener) ->
		@eventListeners.push(listener)
	
	_handleBuddyManagerEvent: (name, data) =>
		if name == "buddyRemoved"
			if @onAirBuddy == data
				@tuneOut()
				
	_handleSongFeedStreamEvent: (name, data) =>
		# TODO maybe get current song, or whatever for UI display