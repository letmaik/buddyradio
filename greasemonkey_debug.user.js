// ==UserScript==
// @name          BuddyRadio
// @namespace     http://github.com/neothemachine/
// @version       0.1
// @description   tbd
// @include       http://grooveshark.com/*
// ==/UserScript==

if (window.top != window.self)  // don't run on iframes
    return;

// use @require when new version of oni apollo is out
// (because greasemonkey would not refresh same-uri scripts (trunk))
var s = document.createElement("script");
s.type = "text/javascript";
//s.src = "http://code.onilabs.com/apollo/0.12/oni-apollo.js";
// need to use trunk version to have callback on require()
s.src = "http://code.onilabs.com/apollo/unstable/oni-apollo.js";
s.addEventListener("load", loadCoffeeOnDelay, false);
document.body.appendChild(s);

function loadCoffeeOnDelay() {
	setTimeout(loadCoffee, 666);
}

function loadCoffee() {
	unsafeWindow.require("github:onilabs/coffee-script/master/extras/coffee-script.js", {callback: coffeeLoaded});
}

function coffeeLoaded(err, module) {
	if (err) throw ('error: ' + err);
	
	var debugMultiLineHack = (<><![CDATA[
exports.start = () ->
	controller = new Controller.Radio([new Model.LastFmBuddyNetwork], [new Model.GroovesharkStreamingNetwork])
	controller.start()

http = require("apollo:http")
LastFmApi = require("apollo:lastfm");
LastFmApi.key = "53cda3b9d8760dbded7b4ca420b5abb2"

EOVR = new Error("must be overriden")
Model = {}

# TODO Feature Idea: in addition to live-listening it would be cool to listen to previous timespans of the buddy
#                    because it's often the case that the buddy isn't listening at the very moment -> Live mode, History mode
class Model.Buddy
	constructor: (@network, @username) ->
		info = @network.getInfo(@username)
		@username = info.name
		@avatarUrl = info.avatarUrl
		@profileUrl = info.profileUrl
		@listeningStatus = @network.getStatus(@username) # live | off | disabled
		@lastSong = @network.getLastSong(@username)
		@_networkListener = (name, data) => @_handleNetworkEvent(name, data)
		@network.registerListener(@_networkListener, @username) # for status changes, current song change
		@_eventListeners = []		
	
	getLiveFeed: () ->
		console.log("getting live feed")
		@network.getLiveFeed(@username)
	
	# fromTime, toTime: UTC unix timestamps
	# fromTime set, toTime = null -> play songs beginning from fromTime
	# fromTime set, toTime set -> play songs between the range
	getHistoricFeed: (fromTime, toTime) ->
		if (fromTime == null and toTime?) or (fromTime == toTime == null)
			throw new Error("invalid param combination")
		@network.createSongFeed(@, fromTime, toTime)
	
	registerListener: (listener) ->
		@_eventListeners.push(listener)
		
	removeListener: (listenerToBeRemoved) ->
		@_eventListeners = (listener for listener in @_eventListeners when listener != listenerToBeRemoved)
		
	dispose: () ->
		@network.removeListener(@_networkListener, @username)
		
	_handleNetworkEvent: (name, data) =>
		if name == "statusChanged"
			@listeningStatus = data
		else if name == "lastSongChanged"
			@lastSong = data
		listener(name, data) for listener in @_eventListeners
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
# only a buddy gets a network and uses it (no one else calls it's methods!)
class Model.BuddyNetwork
	name: "Network Name" # used in links etc.
	className: "Model.XYZBuddyNetwork"
	isValid: (buddyId) -> throw EOVR
	getStatus: (buddyId) -> throw EOVR # live | off | disabled
	getInfo: (buddyId) -> throw EOVR
	getLastSong: (buddyId) -> throw EOVR
	getLiveFeed: (buddyId) -> throw EOVR
	# getHistoricFeed: (buddyId, fromTime, toTime) - implement in sub class if supported
	registerListener: (listener, buddyId) -> throw EOVR
	removeListener: (listener, buddyId) -> throw EOVR
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
			buddy.removeListener(buddyListener)
			if result == "endOfFeed"
				listener("streamCompleted", buddy) for listener in @eventListeners
			else if result == "stopRequest"
				listener("streamStopped", {buddy, reason: "request"}) for listener in @eventListeners
	
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
class Model.Song
	constructor: (@artist, @title, @listenedAt) -> # unix timestamp in s | null if current song
		if not @listenedAt?
			@listenedAt = Math.round(Date.now() / 1000)
		@resources = null # null = not searched yet; [] = no resources found
	toString: () ->
		"Song[#{@artist} - #{@title}]"
		
class Model.SongResource
	constructor: () ->
		@length = null # song length in ms | null if unknown (yet)
		
	getPlayingPosition: () -> throw E # position in ms | null if unknown
class Model.SongFeed
	hasOpenEnd: () -> throw EOVR
	hasNext: () -> throw EOVR		
	next: () -> throw EOVR			
	dispose: () ->
	
class Model.SequentialSongFeedCombinator extends Model.SongFeed
	constructor: (@feeds...) ->
		if @feeds.length == 0
			throw new Error("no feeds given!")
		@_currentFeedIdx = 0
		
	hasOpenEnd: () ->
		@feeds[@feeds.length-1].hasOpenEnd()
		
	hasNext: () ->
		hasNext = @feeds[@_currentFeedIdx].hasNext()
		if not hasNext and not @feeds[@_currentFeedIdx].hasOpenEnd() and @_currentFeedIdx < @feeds.length - 1
			@_currentFeedIdx++
			@hasNext()
		else
			hasNext
		
	next: () ->
		@feeds[@_currentFeedIdx].next()
		
class Model.AlternatingSongFeedCombinator extends Model.SongFeed
	constructor: (@songsPerFeedInARow = 1, @feeds...) ->
		if @feeds.length == 0
			throw new Error("no feeds given!")
		@_currentFeedIdx = 0
		
	hasOpenEnd: () ->
		@feeds.some((feed) -> feed.hasOpenEnd())
		
	hasNext: () ->
		# TODO
		
	next: () ->
		# TODO
class Model.SongFeedStream
	constructor: (@songFeed, @streamingNetworks) ->
		network.registerListener(@_handleStreamingNetworkEvent) for network in @streamingNetworks
		@stopRequest = false
		@queue = []
		@eventListeners = []
				
	registerListener: (listener) ->
		@eventListeners.push(listener)
	
	stopStreaming: () ->
		@stopRequest = true
		listener("streamingStoppedByRequest") for listener in @eventListeners
	
	startStreaming: () ->
		lastSongReceivedAt = -1 # time when last song was available in feed
		lastSongStreamedNetwork = null # network of last song we could actually stream
		loop
			console.log("next iteration")
			if @stopRequest
				@songFeed.dispose()
				@stopRequest = false
				return { status: "stopRequest" }
			if not @songFeed.hasNext()
				if @songFeed.hasOpenEnd()
					console.log("holding..15secs")
					hold(15000)
					continue
				else
					console.info("end of feed, all available songs streamed")
					# TODO inform listeners
					return { status: "endOfFeed" }
			else
				song = @songFeed.next()
				console.log("next: #{song}")
				lastSongReceivedAt = Date.now()
				if @_findAndAddSongResources(song)
					preferredResource = @_getPreferredResource(song.resources, lastSongStreamedNetwork)
					network = @streamingNetworks.filter((network) -> network.canPlay(preferredResource))[0]
					if network.enqueue and lastSongStreamedNetwork == network and @queue.length > 0
						@queue.push(preferredResource)
						network.enqueue(preferredResource)
						console.log("waiting")
						@_waitUntilEndOfQueue(0.9)
					else
						console.log("waiting 2")
						@_waitUntilEndOfQueue(1.0)
						@queue.push(preferredResource)
						network.play(preferredResource)
						lastSongStreamedNetwork = network
						console.log("waiting 3")
						@_waitUntilEndOfQueue(0.9)
				else
					continue # with next song in feed without waiting
			
	dispose: () ->
		if not @stopRequest
			throw new Error("can only dispose after streaming was stopped")
		network.removeListener(@_handleStreamingNetworkEvent) for network in @streamingNetworks
			
	_waitUntilEndOfQueue: (factor) ->
		while @queue.length > 1
			console.debug("holding on... #{@queue.length} songs in queue")
			hold(5000)
		if @queue.length == 0
			return
		
		console.debug("holding on.. until song nearly finished")
		waitingResource = @queue[0]
		while @queue.length == 1 and @queue[0] == waitingResource
			# periodic calculation because user could fast-forward, skip the song or 
			# the length or position isn't available yet
			length = waitingResource.length
			position = waitingResource.getPlayingPosition()
			if length? and position?
				songEndsIn = Math.round(factor * waitingResource.length - waitingResource.getPlayingPosition())
				if songEndsIn < 0
					break
				else if songEndsIn < 10000
					hold(songEndsIn)
					break
			hold(5000)
	
	_findAndAddSongResources: (song) ->
		resources = (network.findSongResource(song.artist, song.title) for network in @streamingNetworks)
		song.resources = resources.filter((resource) -> resource?)
		song.resources.length > 0
		
	_getPreferredResource: (resources, preferredNetwork) ->
		# prefer songs from same network to make use of queueing and more seamless transitions
		if not preferredNetwork?
			resources[0]
		else
			matchingResource = resources.filter((resource) =>
				network = @streamingNetworks.filter((network) -> network.canPlay(resource))[0]
				network == preferredNetwork
			)
			if matchingResource.length == 0
				resources[0]
			else
				matchingResource[0]
		
	# TODO
	playedSongs: []  
	isAlternativeSong: false
	noSongFound: false
				
	_handleStreamingNetworkEvent: (name, data) =>
		if name == "streamingSkipped" and @queue[0] == data
			console.log("song skipped, shifting")
			@queue.shift()
		else if name == "streamingCompleted" and @queue[0] == data
			console.log("song completed, shifting")
			@queue.shift()
class Model.StreamingNetwork
	constructor: () ->
		@eventListeners = []
		
	registerListener: (listener) ->
		@eventListeners.push(listener)
		
	removeListener: (listenerToBeRemoved) ->
		@eventListeners = @eventListeners.filter((listener) -> listener != listenerToBeRemoved)
		
	findSongResource: (artist, title) -> throw new Error("must be overriden")
	canPlay: (songResource) -> throw new Error("must be overriden") # true if this network can handle the specific resource
	play: (songResource) -> throw new Error("must be overriden")
	stop: () -> throw new Error("must be overriden")
	# declare "enqueue: (songResource) ->" in subclass if network supports enqueueing
class Model.GroovesharkSongResource extends Model.SongResource
	constructor: (@songId, @groovesharkNetwork) ->
		super()
		
	getPlayingPosition: () ->
		@groovesharkNetwork.getPlayingPosition(@)
	
class Model.GroovesharkStreamingNetwork extends Model.StreamingNetwork
	constructor: () ->
		super()
		if not (Grooveshark.addSongsByID? and Grooveshark.setSongStatusCallback? and Grooveshark.pause? and Grooveshark.removeCurrentSongFromQueue?)
			throw new Error("Grooveshark API not available or has changed")
		Grooveshark.setSongStatusCallback(@handleGroovesharkEvent)

	findSongResource: (artist, title) ->
		url = http.constructURL("http://buddyradioproxy.appspot.com/tinysong?artist=#{artist}&title=#{title}")
		response = http.json(url)
		if response.SongID?
			new Model.GroovesharkSongResource(response.SongID, @)
		else
			console.warn("no result from tinysong for: #{artist} - #{title}")
			if response.error?
				console.error("error was: #{response.error}")
			null
	
	canPlay: (songResource) ->
		songResource instanceof Model.GroovesharkSongResource
			
	queuedSongResources: []
	currentSongShouldHaveStartedAt = null # timestamp
			
	play: (songResource) ->
		console.debug("playing... Grooveshark songID #{songResource.songId}")
		Grooveshark.addSongsByID([songResource.songId])
		# skip songs which are in the queue
		waitfor
			while Grooveshark.getCurrentSongStatus().song?.songID != songResource.songId
				console.debug("skipping to next song to get to the current one")
				Grooveshark.next()
				hold(1000)
		else
			hold(10000)
			console.error("couldn't skip to current song in Grooveshark player, informing listeners")
			listener("streamingSkipped", songResource) for listener in @eventListeners
			return
		@currentSongShouldHaveStartedAt = Date.now()
		@queuedSongResources.push(songResource)
		@_playIfPaused()	
		
	enqueue: (songResource) ->
		@queuedSongResources.push(songResource)
		Grooveshark.addSongsByID([songResource.songId])		
		
	getPlayingPosition: (songResource) ->
		gsSong = Grooveshark.getCurrentSongStatus().song
		if gsSong? and gsSong.songID == songResource.songId
			
			# as in handleGroovesharkEvent, do some song length correction if needed
			# (it happened that even in "playing" status callback wrong length was reported,
			#  but in "completed" it was right)
			resources = @queuedSongResources.filter((resource) -> resource == songResource)
			if resources.length == 1 and resources[0].length != null and Math.round(gsSong.calculatedDuration) > resources[0].length
				console.log("song length corrected from #{resources[0].length}ms to #{Math.round(gsSong.calculatedDuration)}ms")
				resources[0].length = Math.round(gsSong.calculatedDuration)
			
			gsSong.position
		else
			null
		@cleanup()
		
	cleanup: () ->
		# sometimes grooveshark doesn't add and play a song when calling addSongsByID()
		# this leaves our queue in an inconsistent state so we have to clean it up now and then
		if @queuedSongResources.length > 0 and
		   @queuedSongResources[0].length == null and # length is taken as an indicator that the song was never played
		   (Date.now() - @currentSongShouldHaveStartedAt) > 15000
			console.warn("grooveshark got stuck... skipping song and fixing queue")
			resource = @queuedSongResources.shift()
			listener("streamingSkipped", resource) for listener in @eventListeners
					
	stop: () ->
		Grooveshark.pause()
		@queuedSongResources = []
		# TODO inform listeners, streamingCompleted..?
		
	_playIfPaused: () ->
		while ["paused", "none"].indexOf(Grooveshark.getCurrentSongStatus().status) != -1
			Grooveshark.play()
			hold(1000)
		
	handleGroovesharkEvent: (data) =>
		status = data.status # one of: "none", "loading", "playing", "paused", "buffering", "failed", "completed"
		song = data.song # can be null; useful: .songID, .estimateDuration, .calculatedDuration, .position
		console.debug("GS: #{status}, song id: #{song?.songID}, calculated duration: #{song?.calculatedDuration}, estimated duration: #{song?.estimateDuration}")
		if not @queuedSongResources.some((resource) -> resource.songId == song.songID)
			return
		if song? and song.calculatedDuration != 0
			resource = @queuedSongResources.filter((resource) -> resource.songId == song.songID)[0]
			if resource.length != null
				# grooveshark sometimes delivers wrong song lengths, so we try to correct it
				if Math.round(song.calculatedDuration) > resource.length
					console.log("song length corrected from #{resource.length}ms to #{Math.round(song.calculatedDuration)}ms")
					resource.length = Math.round(song.calculatedDuration)
			else
				resource.length = Math.round(song.calculatedDuration)
				console.debug("song length set to #{resource.length} ms (songId #{song.songID})")			
		if status == "completed" or status == "failed"
			while @queuedSongResources[0].songId != song.songID
				resource = @queuedSongResources.shift()
				listener("streamingSkipped", resource) for listener in @eventListeners
			if @queuedSongResources.length > 0
				@currentSongShouldHaveStartedAt = Date.now()
			resource = @queuedSongResources.shift()
			listener("streamingCompleted", resource) for listener in @eventListeners
			# TODO status "failed" could be handled differently, e.g. trying to play() (works!) one more time
			
		
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
		listener(name, data) for listener in @_eventListeners[username]
		
	removeListener: (listenerToBeRemoved, username) ->
		@_eventListeners[username.toLowerCase()] = 
			(listener for listener in @_eventListeners[username.toLowerCase()] when listener != listenerToBeRemoved)
	
	forceUpdateListeningData: (username) ->
		@_updateListeningData(username.toLowerCase(), 0)
	
	_updateListeningData: (username, cacheLifetime = 30000) ->
		cache = if @_buddyListeningCache.hasOwnProperty(username) then @_buddyListeningCache[username] else null
		lastUpdate = if cache? then cache.lastUpdate else 0
		if (Date.now() - lastUpdate) < cacheLifetime
			# console.debug("skipped updating listening data of #{username}; last refreshed #{Date.now() - lastUpdate} ms ago (cache lifetime: #{cacheLifetime})")
			return
	
		console.info("getting recent tracks and status from Last.fm for #{username}")
		response = null
		try 
			response = LastFmApi.get({method: "user.getRecentTracks", user: username})
		catch e
			if e.code == 4
				if @cache?.status != "disabled"
					@_notifyListeners(username, "statusChanged", "disabled")
				@_buddyListeningCache[username] = {lastUpdate: Date.now(), status: "disabled", currentSong: null, pastSongs: []}
				return
			else
				throw e
		tracks = response.track or []
		currentSong = (
			new Model.Song(
				track.artist["#text"],
				track.name
			) for track in tracks when track["@attr"]?.nowplaying)[0]
		pastSongs = (
			new Model.Song(
				track.artist["#text"],
				track.name,
				track.date.uts
			) for track in tracks when not track["@attr"]?.nowplaying)
		status = if currentSong? then "live" else "off"
		if status != @cache?.status
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
			if oldLastSong != newLastSong
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
		# note: if songs are repeatedly playing exactly in same order then this algorithm will fail and won't find new songs
		# could be circumvented by introducing 1-song delay (so that timestamps can be cpnsidered)
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

	hasOpenEnd: () -> false
		
	_updateFeed: () -> 
		# TODO
View = {}
	
class View.BuddySidebarSection
	constructor: (@radio, @controller) ->
		@radio.registerListener(@handleRadioEvent)
		@radio.buddyManager.registerListener(@handleBuddyManagerEvent)
		@init()
		
	handleRadioEvent: (name, data) =>
		if name == "streamStarted" or name == "streamStopped"
			@_applyStyle(data, name == "streamStarted")
		else if name == "streamNotStarted" and data.reason == "disabled"
			alert("Can't tune in. #{data.username} has disabled access to his song listening data.")
		if name == "streamStopped" and data.reason == "disabled"
			alert("Radio for #{data.username} was stopped because the user has disabled access to his song listening data.")
	
	_applyStyle: (buddy, bold = true, color = null) ->
		label = $("li.sidebar_buddy[rel='#{buddy.network.className}-#{buddy.username}'] .label")
		label.css("font-weight", if bold then "bold" else "normal")
		if color?
			label.css("color", color)
			
	handleBuddyManagerEvent: (name, data) =>
		if ["buddyRemoved", "buddyAdded", "statusChanged", "lastSongChanged", "buddiesLoaded"].indexOf(name) != -1
			@refresh()
		
	init: () ->
		$("#sidebar .container_inner").append("""
		<div id="sidebar_buddyradio_wrapper" class="listWrapper">
            <div class="divider" style="display: block;">
                <span class="sidebarHeading">Buddy Radio</span>
                <a class="sidebarNew"><span>Add Buddy</span></a>
            </div>
            <ul id="sidebar_buddyradio" class="link_group">
				<li> 
					<span class="label ellipsis">loading...</span>
				</li>
			</ul>
        </div>
		""")
		newButton = $("#sidebar_buddyradio_wrapper .sidebarNew")
		newButton.click( () =>
			if $("#buddyradio_newuserform").length == 1
				$("#buddyradio_newuserform").remove()
				return
				
			position = newButton.offset()
			$("body").append("""
			<div id="buddyradio_newuserform" style="position: absolute; top: #{position.top}px; left: #{position.left+20}px; display: block;width: 220px; height:40px" class="jjmenu sidebarmenu jjsidebarMenuNew bottomOriented">
				<div class="jj_menu_item">
					<div style="width: 100px;float:left" class="input_wrapper">
						<div class="cap">
							<input type="text" id="buddyradio_newuser" name="buddy"> 
						</div>
					</div>
					<button id="buddyradio_adduserbutton" type="button" class="btn_style1" style="margin: 4px 0 0 5px">
						<span>Add Last.fm Buddy</span>
					</button>
					
				</div>
			</div>
			""")
			$("#buddyradio_newuser").focus()
			$("#buddyradio_adduserbutton").click(() =>
				@controller.addBuddy("Model.LastFmBuddyNetwork", $("#buddyradio_newuser")[0].value)
				$("#buddyradio_newuserform").remove()
			)
			$("#buddyradio_newuser").keydown((event) =>
				if event.which == 13
					@controller.addBuddy("Model.LastFmBuddyNetwork", $("#buddyradio_newuser")[0].value)
					$("#buddyradio_newuserform").remove()
			)
		)
	refresh: () ->
		console.debug("refreshing view")
		$("#sidebar_buddyradio").empty()
		sortedBuddies = @radio.buddyManager.buddies.slice() # clone array
		sortedBuddies.sort((a, b) ->
			if a.listeningStatus == b.listeningStatus
				if a.username.toLowerCase() < b.username.toLowerCase() then -1 else 1
			else if a.listeningStatus == "live"
				-1
			else if b.listeningStatus == "live"
				1
			else if a.listeningStatus == "off"
				-1
			else
				1
		)
		(
			status = buddy.listeningStatus.toUpperCase()
			if status == "LIVE" or status == "OFF"
				song = "#{buddy.lastSong.artist} - #{buddy.lastSong.title}"
				if status == "LIVE"
					status += ", listening to: #{song}"
				else if status == "OFF" and buddy.lastSong?
					status += ", last listened to: #{song}"
			$("#sidebar_buddyradio").append("""
				<li title="#{buddy.username} (#{buddy.network.name}) - #{status}" rel="#{buddy.network.className}-#{buddy.username}" class="sidebar_buddy buddy sidebar_station sidebar_link"> 
					<a href="">
						<span class="icon remove"></span>
						<span class="icon"></span>
						<span class="label ellipsis">#{buddy.username}</span>
					</a>
				</li>
			""")
			bold = @radio.onAirBuddy == buddy
			color = if buddy.listeningStatus == "off" then "black" else if buddy.listeningStatus == "disabled" then "gray" else null
			@_applyStyle(buddy, bold, color)				
		) for buddy in sortedBuddies
		
		$("li.sidebar_buddy .remove").click((event) =>
			event.preventDefault()
			event.stopPropagation()
			entry = $(event.currentTarget).parent().parent()
			[networkClassName, username] = entry.attr("rel").split("-")
			@controller.removeBuddy(networkClassName, username)
		)
		$("li.sidebar_buddy").click((event) =>
			event.preventDefault()
			[networkClassName, username] = $(event.currentTarget).attr("rel").split("-")
			@controller.tune(networkClassName, username)
		)
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
		
	tune: (networkClassName, username) ->
		if networkClassName and username
			@radio.tune(@radio.buddyManager.getBuddy(networkClassName, username))
	]]></>).toString();
	
	unsafeWindow.CScript = module.CoffeeScript;
	unsafeWindow.CS = debugMultiLineHack;
	var sjsSrc = module.CoffeeScript.compile(debugMultiLineHack);
	unsafeWindow.SJS = sjsSrc;
	unsafeWindow.require("local:buddyradio", {callback: radioLoaded, src: sjsSrc});
}

function radioLoaded(err, module) {
	if (err) alert(err); //throw new Error('error: ' + err);
	module.start();
}

