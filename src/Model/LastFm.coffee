class Model.LastFmBuddyNetwork extends Model.BuddyNetwork
	name: "Last.fm"
	className: "Model.LastFmBuddyNetwork"
	
#	constructor: () ->
#   spawn not yet supported
#		spawn
#			loop
#				for own username, listeners of @_eventListeners
#					@_updateListeningData(username)
#				hold(60000)

	# terms of service: "You will not make more than 5 requests per originating IP address per second, averaged over a 5 minute period"
	# -> this is equal to max 5*60*5=1500 requests per 5 minutes
	# as this is quite high anyway, we will limit it to 500 requests per 5 minutes so that the browser has room to breath
	_rateLimiter: new Model.APIRateLimiter(500, 300)
	
	_buddyCache: {} # map (username -> {avatarUrl, profileUrl})
	_buddyListeningCache: {} # map (username -> {lastUpdate, status, currentSong, pastSongs})
	
	_eventListeners: {} # map (username -> [listeners...])
	
	isValid: (username) ->
		if @_buddyCache.hasOwnProperty(username.toLowerCase())
			return true
		try
			user = LastFmApi.get({ method: "user.getInfo", user: username})
			@_buddyCache[user.name.toLowerCase()] = { name: user.name, avatarUrl: user.image[0]["#text"], profileUrl: user.url }
			return true
		catch e
			return false
			
	_throwIfInvalid: (username) ->
		if not @isValid(username)
			throw new Error("#{username} not existing on Last.fm")
			
	getBuddies: (username) ->
		try
			friends = LastFmApi.get({ method: "user.getFriends", user: username}).user
			return friends.map((friend) -> friend.name)
		catch e	
			if e.code == 6
				return { error: "invalid_user" }
			return { error: "unknown_error" }
	
	getInfo: (username) ->
		user = username.toLowerCase()
		@_throwIfInvalid(user)
		@_updateListeningData(user)
		@_buddyCache[user]
			
	getStatus: (username) ->
		@_throwIfInvalid(username)
		@_updateListeningData(username.toLowerCase())
		@_buddyListeningCache[username.toLowerCase()].status
		
	getLastSong: (username) ->
		user = username.toLowerCase()
		@_throwIfInvalid(user)
		@_updateListeningData(user)
		@_doGetLastSong(user)
			
	_doGetLastSong: (username) ->
		if @_buddyListeningCache[username].status == "live"
			@_buddyListeningCache[username].currentSong
		else if @_buddyListeningCache[username].pastSongs.length > 0
			@_buddyListeningCache[username].pastSongs[0]
		else
			null
		
	# used by LastFmLiveSongFeed
	_getPastSongs: (username) ->
		@_throwIfInvalid(username)
		@_buddyListeningCache[username.toLowerCase()].pastSongs
		
	getLiveFeed: (username) ->
		new Model.LastFmLiveSongFeed(username, @)
		
	getHistoricFeed: (username, from, to) ->
		if not from? or not to?
			throw new Error("wrong parameters")
		new Model.LastFmHistoricSongFeed(username, @, from, to)
	
	# TODO cache data
	hasHistoricData: (username, date) ->
		try
			from = Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0) / 1000)
			to = Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59) / 1000)
			response = LastFmApi.get({
				method: "user.getRecentTracks",
				user: username,
				from, to,
				limit: 1
			})
			if not response.track?
				return false
			# looks like we don't get an array if it's just one track...why?? stupid...
			# remember: the nowplaying track can exist (which will make it 2 songs)
			if not (response.track instanceof Array)
				response.track = [response.track]
			response.track.some((track) -> not track["@attr"]?.nowplaying)
		catch e
			if e.code == 4
				false
			else
				throw e
			
	registerListener: (listener, username) ->
		user = username.toLowerCase()
		if not @_eventListeners.hasOwnProperty(user)
			@_eventListeners[user] = []
		@_eventListeners[user].push(listener)
		
	_notifyListeners: (username, name, data) ->
		if not @_eventListeners.hasOwnProperty(username)
			return
		console.debug("last.fm notify: #{username} #{name} #{data}") 
		listener(name, data) for listener in @_eventListeners[username]
		
	removeListener: (listenerToBeRemoved, username) ->
		@_eventListeners[username.toLowerCase()] = 
			(listener for listener in @_eventListeners[username.toLowerCase()] when listener != listenerToBeRemoved)
	
	forceUpdateListeningData: (username) ->
		@_updateListeningData(username.toLowerCase(), 1000)
	
	_updateListeningData: (username, cacheLifetime = 30000) ->
		cache = if @_buddyListeningCache.hasOwnProperty(username) then @_buddyListeningCache[username] else null
		lastUpdate = if cache? then cache.lastUpdate else 0
		if (Date.now() - lastUpdate) < cacheLifetime
			# console.debug("skipped updating listening data of #{username}; last refreshed #{Date.now() - lastUpdate} ms ago (cache lifetime: #{cacheLifetime})")
			return
		if not @_rateLimiter.canSend()
			console.warn("Last.fm API rate limit exceeded, skipping update of #{username}'s listening data")
			return
			
		console.info("getting recent tracks and status from Last.fm for #{username}")
		response = null
		try 
			@_rateLimiter.count()
			response = LastFmApi.get({method: "user.getRecentTracks", user: username})
		catch e
			if e.code == 4
				if cache?.status != "disabled"
					@_notifyListeners(username, "statusChanged", "disabled")
				@_buddyListeningCache[username] = {lastUpdate: Date.now(), status: "disabled", currentSong: null, pastSongs: []}
			else
				console.error(e)
			return
		tracks = response.track or []
		currentSong = (
			new Model.Song(
				track.artist["#text"],
				track.name,
				track.album?["#text"]
			) for track in tracks when track["@attr"]?.nowplaying)[0]
		pastSongs = (
			new Model.Song(
				track.artist["#text"],
				track.name,
				track.album?["#text"],
				track.date.uts
			) for track in tracks when not track["@attr"]?.nowplaying)
		status = if currentSong? then "live" else "off"
		if status != cache?.status
			@_notifyListeners(username, "statusChanged", status)
		
		# there is a short timespan in between two songs where the user appears offline because at this very moment
		# and until the new song status is transmitted by the last.fm client the user isn't "listening" to anything
		# if such case "live -> off" happens then data won't be updated if the last update was < 10 secs ago
		if status == "off" and cache?.status == "live" and (Date.now() - cache.lastUpdate) < 10000
			console.debug("#{username} went off in the last 10s, will update when >10s")
		else
			# only update if new song (so that listenedAt doesn't get reset otherwise)
			newCurrentSong = cache?.currentSong
			if cache?.currentSong? and currentSong?
				if cache.currentSong.artist != currentSong.artist or 
				   cache.currentSong.title != currentSong.title or
				   (cache.pastSongs.length > 0 and cache.pastSongs[0].listenedAt != pastSongs[0].listenedAt)
					newCurrentSong = currentSong			
			else
				newCurrentSong = currentSong
			oldLastSong = if cache? then @_doGetLastSong(username) else null
			@_buddyListeningCache[username] = {lastUpdate: Date.now(), status, currentSong: newCurrentSong, pastSongs}
			newLastSong = @_doGetLastSong(username)
			if oldLastSong? and newLastSong?
				if oldLastSong.listenedAt != newLastSong.listenedAt
					@_notifyListeners(username, "lastSongChanged", newLastSong)
			else if oldLastSong != newLastSong
				@_notifyListeners(username, "lastSongChanged", newLastSong)

class Model.LastFmSongFeed extends Model.SongFeed
	constructor: () ->
		super()
		@_songs = []
		@_songsQueuedLength = 0
		@_currentSongsIdx = -1
		@_endOfFeedEventSent = false
	
	hasNext: () ->
		if @_songsQueuedLength == 0
			@_updateFeed()
		if @_songsQueuedLength == 0 and not @hasOpenEnd() and not @_endOfFeedEventSent
			listener("endOfFeed", @) for listener in @_eventListeners
			@_endOfFeedEventSent = true
		@_songsQueuedLength > 0
		
	next: () ->
		if @_songsQueuedLength == 0
			throw new Error("no more songs available!")
		@_currentSongsIdx++
		@_songsQueuedLength--
		console.debug("feed queue: #{@_songs[@_currentSongsIdx...@_songs.length]}")
		@_songs[@_currentSongsIdx]
		
	_addSong: (song) ->
		@_songs.push(song)
		@_songsQueuedLength++
	
	_updateFeed: () -> throw EOVR
			
class Model.LastFmLiveSongFeed extends Model.LastFmSongFeed
	constructor: (@username, @lastFmNetwork) ->
		super()
		@notEarlierThan = 0
		pastSongs = @lastFmNetwork._getPastSongs(@username)
		if pastSongs.length > 0
			@notEarlierThan = pastSongs[0].listenedAt + 1
					
	hasOpenEnd: () -> true
		
	_updateFeed: () -> 
		@_mergeNewSongs()
		if @_songsQueuedLength == 0
			@lastFmNetwork.forceUpdateListeningData(@username)
			@_mergeNewSongs()
			
	_mergeNewSongs: () ->
		status = @lastFmNetwork.getStatus(@username)
		if status == "disabled"
			return
		currentSong = if status == "live" then @lastFmNetwork.getLastSong(@username) else null
		if @_songs.length == 0
			if currentSong?
				@_addSong(currentSong)
			return
		if @_songs[@_songs.length-1] == currentSong
			return
		
		# at this point there's at least one new song OR/AND the user went offline (= no current song)
		pastSongs = @lastFmNetwork._getPastSongs(@username).slice()
		songsToCheck = pastSongs.reverse()
		while songsToCheck.length > 0 and songsToCheck[0].listenedAt < @notEarlierThan
			songsToCheck.shift()
		if status == "live"
			songsToCheck.push(currentSong)
		if songsToCheck.length == 0
			return
		
		# only check 5 songs max for both old AND new songs
		# (compromise between not missing too much songs (when paused etc.) and be able to handle repeated album plays)
		# with max 5, when repeating an album, problems can occur if album length < 10
		# if album length <= 5, then those songs will be ignored because the algorithm detects them as already played
		# if 5 < album length < 10, it depends on how many songs were missed
		#  e.g. if length = 7, then max. 2 songs can be missed without problems
		#       if length = 9, then max. 4 songs can be missed without problems
		#  -> if more songs were missed and it's still the repeated album, then those new songs will be ignored
		#  -> could be circumvented by introducing 1-song delay (so that timestamps can be considered)
		#     -> TODO implement as option?
		# (currently playing song doesn't have a timestamp (=primary key) in last.fm's listening history)
		# (if it would have a timestamp, then it also would have to be identical when the song lands in the pastSongs)
		if songsToCheck.length > 5
			songsToCheck = songsToCheck[songsToCheck.length-5..]
		
		# don't check all old songs
		oldIdxPart = @_songs.length - 1 - songsToCheck.length
		oldIdx = if oldIdxPart > 0 then oldIdxPart else 0
		newIdx = 0
		console.debug("songsToCheck: #{songsToCheck}")
		console.debug("_songs: #{@_songs}")

		# find starting position of new songs
		while oldIdx < @_songs.length and newIdx != songsToCheck.length
			console.debug("pre-loop: oldIdx: #{oldIdx}, newIdx: #{newIdx}")
			previousNewIdx = newIdx
			while newIdx < songsToCheck.length and (@_songs[oldIdx].artist != songsToCheck[newIdx].artist or @_songs[oldIdx].title != songsToCheck[newIdx].title)
				console.debug("oldIdx: #{oldIdx}, newIdx: #{newIdx}")
				newIdx++
			if newIdx == songsToCheck.length
				if previousNewIdx == 0
					newIdx = 0
				else
					newIdx = previousNewIdx
			else
				newIdx++
			oldIdx++
		# now add new songs
		while newIdx < songsToCheck.length
			@_addSong(songsToCheck[newIdx])
			++newIdx
			
		# remove some garbage now and then
		if @_currentSongsIdx > songsToCheck.length * 10
			oldSongsKept = songsToCheck.length * 2
			newStartIdx = @_currentSongsIdx - oldSongsKept
			@_songs = @_songs[newStartIdx...]
			@_currentSongsIdx = @_currentSongsIdx - newStartIdx
		
class Model.LastFmHistoricSongFeed extends Model.LastFmSongFeed
	constructor: (@username, @lastFmNetwork, @from, @to) ->
		super()
		response = @_getPage(1)
		if not response?
			throw new Error("listening history disabled")
		@page = response["@attr"].totalPages		

	hasOpenEnd: () -> false
		
	_updateFeed: () ->
		if @page < 1
			return
		response = @_getPage(@page)
		if not response?
			return
		@page--
		if not (response.track instanceof Array)
			response.track = [response.track]
		tracks = response.track.reverse()
		@_addSong(
			new Model.Song(
				track.artist["#text"],
				track.name,
				track.album?["#text"],
				track.date.uts
			)
		) for track in tracks when not track["@attr"]?.nowplaying
			
	_getPage: (page) ->
		try
			LastFmApi.get({
				method: "user.getRecentTracks",
				user: @username,
				from: Math.round(@from.getTime() / 1000),
				to: Math.round(@to.getTime() / 1000),
				page: page
			})
		catch e
			if e.code == 4
				null
			else
				throw e