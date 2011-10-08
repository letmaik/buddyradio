class Model.Radio
	constructor: (@buddyNetworks, @streamingNetworks) ->
		@buddyManager = new Model.BuddyManager(@buddyNetworks)
		@buddyManager.registerListener(@_handleBuddyManagerEvent)
		@_currentStream = null
		@_eventListeners = []
		@_onAirBuddies = {} # map username -> SongFeed
		@_feedCombinator = new Model.AlternatingSongFeedCombinator()
		
	tune: (buddy) ->
		if @isOnAir(buddy)
			@tuneOut(buddy)
		else
			if buddy.listeningStatus == "disabled"
				listener("errorTuningIn", {buddy, reason: "disabled"}) for listener in @_eventListeners
				return
			feed = buddy.getLiveFeed()
			@_feedCombinator.addFeed(feed)
			@_onAirBuddies[buddy.username] = feed
			
			listener("tunedIn", buddy) for listener in @_eventListeners
			
			if @_currentStream == null
				@_currentStream = new Model.SongFeedStream(@_feedCombinator, @streamingNetworks)
				result = @_currentStream.startStreaming()
				console.debug("stream returned: #{result.status}")
#				if result.status == "endOfFeed"
#					listener("streamCompleted") for listener in @_eventListeners
#					console.info("stream completed")
#				else if result.status == "stopRequest"
#					listener("streamStopped", {reason: "request"}) for listener in @_eventListeners
#					console.info("stream stopped")
	
	tuneOut: (buddy, reason = "request") ->
		if @isOnAir(buddy)
			@_feedCombinator.removeFeed(@_onAirBuddies[buddy.username])
			delete @_onAirBuddies[buddy.username]
			listener("tunedOut", {buddy, reason}) for listener in @_eventListeners
			if @_onAirBuddies.length == 0
				@_currentStream.stopStreaming()
				@_currentStream.dispose()
				@_currentStream = null
		
	registerListener: (listener) ->
		@_eventListeners.push(listener)
		
	isOnAir: (buddy) ->
		@_onAirBuddies.hasOwnProperty(buddy.username)
	
	_handleBuddyManagerEvent: (name, data) =>
		if name == "buddyRemoved" and @isOnAir(data)
			@tuneOut(data, "buddyRemoved")
		if name == "statusChanged" and data.data == "disabled" and @isOnAir(data.buddy)
			@tuneOut(data.buddy, "disabled")
				
	_handleSongFeedStreamEvent: (name, data) =>
		# TODO maybe get current song, or whatever for UI display