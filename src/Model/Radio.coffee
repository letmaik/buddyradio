# TODO all internal maps of type username -> .. will fail if more buddy networks are supported and
#      a user with same username is added in two networks

# WONTFIX if a user's radio is switched on and off quickly some times, then identical songs get added/played in Grooveshark
#      -> not easily possible with Grooveshark's limited queue API


class Model.Radio
	constructor: (@buddyNetworks, @streamingNetworks) ->
		@buddyManager = new Model.BuddyManager(@buddyNetworks)
		@buddyManager.registerListener(@_handleBuddyManagerEvent)
		@_currentStream = null
		@_eventListeners = []
		@_feedEnabledBuddies = {} # map username -> SongFeed
		@_feedCombinator = new Model.AlternatingSongFeedCombinator()
		@_feedCombinator.registerListener(@_handleFeedCombinatorEvent)
		# TODO must be cleaned up now and then
		#      -> be careful: unselected users can still finish their song, so don't delete as soon as feed removed!
		@_feededSongs = {} # map username -> [songs]
		@onAirBuddy = null
		
	tune: (buddy) ->
		if @isFeedEnabled(buddy)
			@tuneOut(buddy)
		else
			if buddy.listeningStatus == "disabled"
				listener("errorTuningIn", {buddy, reason: "disabled"}) for listener in @_eventListeners
				return
			feed = buddy.getLiveFeed()
			@_feedCombinator.addFeed(feed)
			@_feedEnabledBuddies[buddy.username] = feed
			
			listener("tunedIn", buddy) for listener in @_eventListeners
			
			if @_currentStream == null
				@_currentStream = new Model.SongFeedStream(@_feedCombinator, @streamingNetworks)
				@_currentStream.registerListener(@_handleSongFeedStreamEvent)
				console.debug("starting new stream")
				result = @_currentStream.startStreaming()
				console.debug("stream returned: #{result.status}")
#				if result.status == "endOfFeed"
#					listener("streamCompleted") for listener in @_eventListeners
#					console.info("stream completed")
				if result.status == "stopRequest"
					# TODO duplicated code
					oldOnAirBuddy = @onAirBuddy
					@onAirBuddy = null
					listener("nobodyPlaying", {lastPlayingBuddy: oldOnAirBuddy}) for listener in @_eventListeners
					console.info("stream stopped")
	
	tuneOut: (buddy, reason = "request") ->
		if @isFeedEnabled(buddy)
			@_feedCombinator.removeFeed(@_feedEnabledBuddies[buddy.username])
			delete @_feedEnabledBuddies[buddy.username]
			listener("tunedOut", {buddy, reason}) for listener in @_eventListeners
			if Object.keys(@_feedEnabledBuddies).length == 0
				@_currentStream.stopStreaming()
				@_currentStream.dispose()
				@_currentStream = null
		
	registerListener: (listener) ->
		@_eventListeners.push(listener)
		
	isFeedEnabled: (buddy) ->
		@_feedEnabledBuddies.hasOwnProperty(buddy.username)
		
	isOnAir: (buddy) ->
		buddy == @onAirBuddy
	
	_handleBuddyManagerEvent: (name, data) =>
		if name == "buddyRemoved" and @isFeedEnabled(data)
			@tuneOut(data, "buddyRemoved")
		if name == "statusChanged" and data.data == "disabled" and @isFeedEnabled(data.buddy)
			@tuneOut(data.buddy, "disabled")
				
	_handleFeedCombinatorEvent: (name, data) =>
		if name == "nextSongReturned"
			username = @_getUsernameByFeed(data.feed)
			if not @_feededSongs.hasOwnProperty(username)
				@_feededSongs[username] = []
			@_feededSongs[username].push(data.song)
			console.debug("song '#{data.song}' feeded from #{username}")
	
	_getUsernameByFeed: (feed) ->
		Object.keys(@_feedEnabledBuddies).filter((username) => @_feedEnabledBuddies[username] == feed)[0]
	
	_getUsernameBySong: (song) ->
		Object.keys(@_feededSongs).filter((username) => @_feededSongs[username].indexOf(song) != -1)[0]
				
	_handleSongFeedStreamEvent: (name, data) =>
		if name == "songPlaying"
			song = data
			username = @_getUsernameBySong(song)
			# FIXME hacky
			oldOnAirBuddy = @onAirBuddy
			@onAirBuddy = @buddyManager.buddies.filter((buddy) -> buddy.username == username)[0]
			listener("nowPlaying", {buddy: @onAirBuddy, lastPlayingBuddy: oldOnAirBuddy}) for listener in @_eventListeners
			console.debug("new song playing by #{@onAirBuddy}")
		else if name == "nothingPlaying"
			oldOnAirBuddy = @onAirBuddy
			@onAirBuddy = null
			listener("nobodyPlaying", {lastPlayingBuddy: oldOnAirBuddy}) for listener in @_eventListeners
			console.debug("nobody's playing anything")