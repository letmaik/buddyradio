# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

# TODO all internal maps of type username -> .. will fail if more buddy networks are supported and
#      a user with same username is added in two networks
#      solution: use real maps (http://stackoverflow.com/questions/368280/javascript-hashmap-equivalent/383540#383540)
#                e.g. map Buddy -> SongFeed

# WONTFIX if a user's radio is switched on and off quickly some times, then identical songs get added/played in Grooveshark
#      -> not easily possible with Grooveshark's limited queue API


class Model.Radio
	constructor: (@buddyNetworks, @streamingNetworks) ->
		@buddyManager = new Model.BuddyManager(@buddyNetworks)
		@buddyManager.registerListener(@_handleBuddyManagerEvent)
		@_currentStream = null
		@_eventListeners = []
		@_feedEnabledBuddies = {} # map username -> {feed: SongFeed, type: "live|historic"}
		@_feedCombinator = new Model.AlternatingSongFeedCombinator()
		@_feedCombinator.registerListener(@_handleFeedCombinatorEvent)
		# TODO clean up now and then (problem: when?)
		#      -> not when "nothingPlaying" received, doesn't work if networks only support play()
		#         because between songs this event will occur!
		@_feededSongs = {} # map username -> [songs]
		@_preloadCount = 1
		@onAirBuddy = null
		@loadSettings()
		
	_settingsStorageKey: "buddyRadio_Settings"
		
	# from = to = null -> live
	tune: (buddy, from = null, to = null) ->
		historic = from? and to?
		if @isFeedEnabled(buddy)
			newFeedType = if historic then "historic" else "live"
			feed = @_feedEnabledBuddies[buddy.username]
			@tuneOut(buddy)
			# stop if live -> live or historic -> live
			# this logic should probably belong somewhere else and be a bit more concise
			if newFeedType == "live"
				return

		if buddy.listeningStatus == "disabled"
			listener("errorTuningIn", {buddy, reason: "disabled"}) for listener in @_eventListeners
			return
		
		feed = 
			if historic
				buddy.getHistoricFeed(from, to)
			else
				buddy.getLiveFeed()
		feed.registerListener((name, data) =>
			if name == "endOfFeed"
				username = @_getUsernameByFeed(data)
				# FIXME hacky
				buddy = @buddyManager.buddies.filter((buddy) -> buddy.username == username)[0]
				@tuneOut(buddy, "endOfFeed")
		)
		@_feedCombinator.addFeed(feed)
		@_feedEnabledBuddies[buddy.username] = 
			if historic
				{ feed, type: "historic", from, to}
			else
				{ feed, type: "live" }
		
		listener("tunedIn", buddy) for listener in @_eventListeners
		
		if not @_currentStream?
			@_currentStream = new Model.SongFeedStream(@_feedCombinator, @streamingNetworks, @_preloadCount)
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
			@_feedCombinator.removeFeed(@_feedEnabledBuddies[buddy.username].feed)
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
		
	getFeedType: (buddy) ->
		if not @isFeedEnabled(buddy)
			throw new Error("feed isn't enabled!!")
		@_feedEnabledBuddies[buddy.username].type
		
	getTotalCountForHistoricFeed: (buddy) ->
		if @getFeedType(buddy) != "historic"
			throw new Error("feed isn't historic!")
		@_feedEnabledBuddies[buddy.username].feed.totalCount

	getAlreadyFeededCount: (buddy) ->
		@_feedEnabledBuddies[buddy.username].feed.feededCount
		
	isOnAir: (buddy) ->
		buddy == @onAirBuddy
	
	getSongsPerFeedInARow: () ->
		@_feedCombinator.songsPerFeedInARow
	
	setSongsPerFeedInARow: (count, dontSave = false) ->
		@_feedCombinator.songsPerFeedInARow = count
		if not dontSave
			@saveSettings()
	
	getPreloadCount: () ->
		@_preloadCount
	
	setPreloadCount: (count) ->
		@_preloadCount = count
		if @_currentStream?
			@_currentStream.preloadCount = count
		@saveSettings()
		
	loadSettings: () ->
		settings = JSON.parse(localStorage[@_settingsStorageKey] or "{}")
		if settings.hasOwnProperty("songsPerFeedInARow")
			@setSongsPerFeedInARow(settings.songsPerFeedInARow, true)
		if settings.hasOwnProperty("preloadCount")
			@_preloadCount = settings.preloadCount
	
	saveSettings: () ->
		settings = {
			songsPerFeedInARow: @getSongsPerFeedInARow(),
			preloadCount: @_preloadCount
		}
		localStorage[@_settingsStorageKey] = JSON.stringify(settings)
	
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
		Object.keys(@_feedEnabledBuddies).filter((username) => @_feedEnabledBuddies[username].feed == feed)[0]
	
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