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
		
	getHistoricFeed: (username, fromTime, toTime) ->
		if fromTime == null or toTime == null
			throw new Error("wrong parameters")
		new Model.LastFmHistoricSongFeed(username, @, fromTime, toTime)
			
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
		@_songs = []
		@_songsQueuedLength = 0
		@_currentSongsIdx = -1		
	
	hasNext: () ->
		if @_songsQueuedLength == 0
			@_updateFeed()
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
		
		# don't check all old songs
		oldIdxPart = @_songs.length - 1 - songsToCheck.length
		oldIdx = if oldIdxPart > 0 then oldIdxPart else 0
		newIdx = 0
		console.debug("songsToCheck: #{songsToCheck}")
		console.debug("_songs: #{@_songs}")
		# find starting position of new songs
		# note: if the same songs are repeatedly played exactly in same order and there was a longer pause 
		#       where the user didn't fetch new songs then this algorithm might not find new songs
		#       because it'd think that nothing changed (probably very rare)
		#  -> could be circumvented by introducing 1-song delay (so that timestamps can be considered)
		# (currently playing song doesn't have a timestamp (=primary key) in last.fm's listening history)
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
	constructor: (@username, @lastFmNetwork, @fromTime, @toTime) ->
		super()
		response = @_getPage(1)
		if response == null
			throw new Error("listening history disabled")
		@page = response["@attr"].totalPages		

	hasOpenEnd: () -> false
		
	_updateFeed: () ->
		if @page < 1
			return
		response = @_getPage(@page)
		if response == null
			return
		@page--
		tracks = (response.track or []).reverse()
		@_addSong(
			new Model.Song(
				track.artist["#text"],
				track.name,
				track.date.uts
			)
		) for track in tracks when not track["@attr"]?.nowplaying
			
	_getPage: (page) ->
		response = null
		try
			response = LastFmApi.get({
				method: "user.getRecentTracks",
				user: @username,
				from: @fromTime,
				to: @toTime,
				page: page
			})
		catch e
			if e.code == 4
				return null
			else
				throw e
		response
