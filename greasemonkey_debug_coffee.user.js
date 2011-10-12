// ==UserScript==
// @name          BuddyRadio
// @namespace     http://github.com/neothemachine/
// @version       0.2
// @description   tbd
// @include       http://grooveshark.com/*
// ==/UserScript==


if (window.top != window.self)  // don't run on iframes
    return;
	
// TODO only execute if Grooveshark object available (takes some time!)
// (or prevent it from running on http://grooveshark.com/upload etc.)

var s = document.createElement("script");
s.type = "text/javascript";
s.src = "http://code.onilabs.com/apollo/0.13/oni-apollo.js";
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
# see http://stackoverflow.com/questions/667508/whats-a-good-rate-limiting-algorithm

class Model.APIRateLimiter
	# rate in messages, per in seconds
	constructor: (@rate, per) ->
		@per = per*1000
		@_allowance = @rate
		@_lastCount = Date.now()
	
	# count a new sent message
	count: () -> 
		current = Date.now()
		timePassed = current - @_lastCount
		@_lastCount = current
		@_allowance+= timePassed * (@rate / @per)
		if @_allowance > @rate
			@_allowance = @rate
		if @_allowance < 1
			console.error("API rate limit exceeded! always check with canSend() before!!")
		@_allowance-= 1
	
	canSend: () ->
		current = Date.now()
		timePassed = current - @_lastCount
		newAllowance = @_allowance + timePassed * (@rate / @per)
		newAllowance >= 1
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
	getHistoricFeed: (fromTime, toTime) ->
		if fromTime == null or toTime == null
			throw new Error("times must be given for historic feed")
		@network.getHistoricFeed(@username, fromTime, toTime)
	
	registerListener: (listener) ->
		@_eventListeners.push(listener)
		
	removeListener: (listenerToBeRemoved) ->
		@_eventListeners = (listener for listener in @_eventListeners when listener != listenerToBeRemoved)
		
	dispose: () ->
		@network.removeListener(@_networkListener, @username)
		@_eventListeners = []
		
	_handleNetworkEvent: (name, data) =>
		if name == "statusChanged"
			@listeningStatus = data
		else if name == "lastSongChanged"
			@lastSong = data
		listener(name, data) for listener in @_eventListeners
		
	toString: () ->
		"Buddy[#{@network.name}:#{@username}]"
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
			buddy.registerListener((name, data) => @_handleBuddyEvent(buddy, name, data))
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
		
	_handleBuddyEvent: (buddy, name, data) =>
		if ["statusChanged", "lastSongChanged"].indexOf(name) != -1
			listener(name, {buddy, data}) for listener in @eventListeners
			
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
	
	getSongsPerFeedInARow: () ->
		@_feedCombinator.songsPerFeedInARow
	
	setSongsPerFeedInARow: (count) ->
		@_feedCombinator.songsPerFeedInARow = count
	
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
class Model.Song
	constructor: (@artist, @title, @album = null, @listenedAt) -> # unix timestamp in s | null if current song
		if not @listenedAt?
			@listenedAt = Math.round(Date.now() / 1000)
		@resources = null # null = not searched yet; [] = no resources found
	toString: () ->
		"Song[#{@artist} - #{@title} - #{@album}]"
		
class Model.SongResource
	constructor: () ->
		@length = null # song length in ms | null if unknown (yet)
		
	getPlayingPosition: () -> throw E # position in ms | null if unknown
class Model.SongFeed
	hasOpenEnd: () -> throw EOVR
	hasNext: () -> throw EOVR		
	next: () -> throw EOVR
	
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
		
	addFeed: (feed) ->
		@feeds.push(feed)
		
class Model.AlternatingSongFeedCombinator extends Model.SongFeed
	constructor: (@songsPerFeedInARow = 1, @feeds...) ->
		@_currentFeedIdx = 0
		@_currentFeedSongsInARow = 0
		@_eventListeners = []
		
	registerListener: (listener) ->
		@_eventListeners.push(listener)
		
	hasOpenEnd: () ->
		@feeds.some((feed) -> feed.hasOpenEnd())
		
	hasNext: () ->
		if @feeds.length == 0
			return false
		if @_currentFeedSongsInARow < @songsPerFeedInARow and @feeds[@_currentFeedIdx].hasNext()
			return true
		@_moveToNextFeed()
		@_currentFeedSongsInARow = 0
		startIdx = @_currentFeedIdx
		while not @feeds[@_currentFeedIdx].hasNext()
			@_moveToNextFeed()
			if @_currentFeedIdx == startIdx
				return false
		true
		
	_moveToNextFeed: () ->
		@_currentFeedIdx =
			if @_currentFeedIdx == @feeds.length - 1
				0
			else
				@_currentFeedIdx + 1
		
	next: () ->
		@_currentFeedSongsInARow++
		song = @feeds[@_currentFeedIdx].next()
		listener("nextSongReturned", {feed: @feeds[@_currentFeedIdx], song}) for listener in @_eventListeners
		song
		
	addFeed: (feed) ->
		@feeds.push(feed)
		console.debug("feed added")
		
	removeFeed: (feedToRemove) ->
		if not @feeds.some((feed) -> feed == feedToRemove)
			throw new Error("feed cannot be removed (not found)")
		@feeds = @feeds.filter((feed) -> feed != feedToRemove)
		@_currentFeedIdx = 0
		console.debug("feed removed")
		@_currentFeedSongsInARow = 0
class Model.SongFeedStream
	constructor: (@songFeed, @streamingNetworks) ->
		network.registerListener(@_handleStreamingNetworkEvent) for network in @streamingNetworks
		@stopRequest = false
		@queue = [] # array of {song, resource}
		@_eventListeners = []
		@_stopRequestCall = () ->
				
	registerListener: (listener) ->
		@_eventListeners.push(listener)
	
	stopStreaming: () ->
		@stopRequest = true
		console.log("stop request received")
		listener("streamingStoppedByRequest") for listener in @_eventListeners
		@_stopRequestCall()
			
	startStreaming: () ->
		@stopRequest = false
		lastSongReceivedAt = -1 # time when last song was available in feed
		lastSongStreamedNetwork = null # network of last song we could actually stream
		
		waitfor
			loop
				console.log("next iteration")
				if @stopRequest
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
							@queue.push({song, resource: preferredResource})
							network.enqueue(preferredResource)
							console.log("waiting")
							@_waitUntilEndOfQueue(0.9)
						else
							console.log("waiting 2")
							@_waitUntilEndOfQueue(1.0)
							@queue.push({song, resource: preferredResource})
							listener("songPlaying", song) for listener in @_eventListeners
							network.play(preferredResource)
							lastSongStreamedNetwork = network
							console.log("waiting 3")
							@_waitUntilEndOfQueue(0.9)
					else
						continue # with next song in feed without waiting
		else
			waitfor rv
				@_stopRequestCall = resume
			return { status: "stopRequest" }
			
			
	dispose: () ->
		if not @stopRequest
			throw new Error("can only dispose after streaming was stopped")
		network.removeListener(@_handleStreamingNetworkEvent) for network in @streamingNetworks
		@_eventListeners = []
			
	_waitUntilEndOfQueue: (factor) ->
		while @queue.length > 1
			console.debug("holding on... #{@queue.length} songs in queue")
			hold(5000)
		if @queue.length == 0
			return
		
		console.debug("holding on.. until song nearly finished")
		waitingResource = @queue[0].resource
		while @queue.length == 1 and @queue[0].resource == waitingResource
			# periodic calculation because user could fast-forward, skip the song or 
			# the length or position isn't available yet
			length = waitingResource.length
			position = waitingResource.getPlayingPosition()
			console.debug("length: #{length}, position: #{position}")
			if length? and position?
				songEndsIn = Math.round(factor * waitingResource.length - waitingResource.getPlayingPosition())
				console.debug("songEndsIn: #{songEndsIn}")
				if songEndsIn < 0
					break
				else if songEndsIn < 10000
					hold(songEndsIn)
					break
			hold(5000)
		if @queue.length != 1
			console.warn("queue length changed to #{@queue.length}")
		if @queue > 0 and @queue[0].resource != waitingResource
			console.warn("resource on which we are waiting for changed to #{@waitingResource}")
	
	_findAndAddSongResources: (song) ->
		if song.resources == null
			resources = (network.findSongResource(song.artist, song.title, song.album) for network in @streamingNetworks)
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
#	isAlternativeSong: false
#	noSongFound: false
				
	_handleStreamingNetworkEvent: (name, data) =>
		if ["streamingSkipped", "streamingCompleted", "streamingFailed"].indexOf(name) != -1 and @queue[0].resource == data	
			if name == "streamingSkipped"
				console.log("song skipped, shifting")
			else if name == "streamingCompleted"
				console.log("song completed, shifting")
			else if name == "streamingFailed"
				console.log("song failed to play, shifting")
			@queue.shift()
			if @queue.length > 0
				listener("songPlaying", @queue[0].song) for listener in @_eventListeners
			else
				listener("nothingPlaying") for listener in @_eventListeners
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
		
	toString: () ->
		"GroovesharkSongResource[songId: #{@songId}]"
		
class Model.GroovesharkStreamingNetwork extends Model.StreamingNetwork
	constructor: () ->
		super()
		if not (Grooveshark.addSongsByID? and Grooveshark.setSongStatusCallback? and Grooveshark.pause? and Grooveshark.removeCurrentSongFromQueue?)
			throw new Error("Grooveshark API not available or has changed")
		Grooveshark.setSongStatusCallback(@handleGroovesharkEvent)

	findSongResource: (artist, title, album = null) ->
		albumParam = if album? then "&album=#{album}" else ""			
		url = http.constructURL("http://buddyradioproxy.appspot.com/tinysong?artist=#{artist}&title=#{title}#{albumParam}")
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
	lastFailedSongResource = null
	
	# TODO play() doesn't have re-try functionality in case the song couldn't be added via .addSongsByID()
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
		@cleanup()
		gsSong = Grooveshark.getCurrentSongStatus().song
		if gsSong? and gsSong.songID == songResource.songId
			
			# as in handleGroovesharkEvent, do some song length correction if needed
			# (it happened that even in "playing" status callback wrong length was reported,
			#  but in "completed" it was right)
			resources = @queuedSongResources.filter((resource) -> resource == songResource)
			if resources.length == 1 and resources[0].length != null and Math.round(gsSong.calculatedDuration) > resources[0].length
				console.debug("song length corrected from #{resources[0].length}ms to #{Math.round(gsSong.calculatedDuration)}ms")
				resources[0].length = Math.round(gsSong.calculatedDuration)
			
			gsSong.position
		else
			null
		
	cleanup: () ->
		# sometimes grooveshark doesn't add and play a song when calling addSongsByID()
		# this leaves our queue in an inconsistent state so we have to clean it up now and then
		if @queuedSongResources.length > 0 and
		   @queuedSongResources[0].length == null # length is taken as an indicator that the song was never played
			if (Date.now() - @currentSongShouldHaveStartedAt) > 10000
				console.warn("grooveshark got stuck... trying to re-add current song")
				resource = @queuedSongResources.shift()
				oldDate = @currentSongShouldHaveStartedAt
				# if current song got stuck indefinitely in loading state, 
				# then remove it first, so that skipping logic in play() works when adding the song again
				if Grooveshark.getCurrentSongStatus().song?.songID == resource.songId
					Grooveshark.removeCurrentSongFromQueue()
				@play(resource)
				@currentSongShouldHaveStartedAt = oldDate
			else if (Date.now() - @currentSongShouldHaveStartedAt) > 25000
				console.warn("grooveshark got stuck... giving up. skipping song and fixing queue")
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
		if not @queuedSongResources.some((resource) -> resource.songId == song?.songID)
			return
		
		# set or correct song length
		if song.calculatedDuration != 0
			resource = @queuedSongResources.filter((resource) -> resource.songId == song.songID)[0]
			if resource.length?
				# grooveshark sometimes delivers wrong song lengths, so we try to correct it
				if Math.round(song.calculatedDuration) > resource.length
					console.debug("song length corrected from #{resource.length}ms to #{Math.round(song.calculatedDuration)}ms")
					resource.length = Math.round(song.calculatedDuration)
			else
				resource.length = Math.round(song.calculatedDuration)
				console.debug("song length set to #{resource.length} ms (songId #{song.songID})")
		
		# check if song was skipped
		while @queuedSongResources[0].songId != song.songID
			resource = @queuedSongResources.shift()
			listener("streamingSkipped", resource) for listener in @eventListeners
		
		# check if current song finished playing or failed to play
		if ["completed", "failed"].indexOf(status) != -1
			# note: "none" gets fired when next song is already loaded and user skipped to it
			#       -> then the old song fires "none" instead of "completed"
			#       "none" is also sometimes fired when a song hasn't started loading yet
			#       -> too complicated atm to actually use it to detect song skipping
			if @queuedSongResources.length > 0
				@currentSongShouldHaveStartedAt = Date.now()
			resource = @queuedSongResources.shift()
			listener("streamingCompleted", resource) for listener in @eventListeners
		
		# try to fix failed song
		if status == "failed"
			# already tried to fix it one time, giving up now
			if @lastFailedSongResource == @queuedSongResources[0]
				listener("streamingFailed", @lastFailedSongResource) for listener in @eventListeners
			# try to fix it
			else
				resource = @queuedSongResources.shift()
				@lastFailedSongResource = resource
				@play(resource)
		
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
View = {}

# TODO Feature idea: make the orange station icon glow when a song from the particular buddy is played
#      -> this is esp. useful when multiple buddies are listened to

class View.BuddySidebarSection
	constructor: (@radio, @controller) ->
		@radio.registerListener(@handleRadioEvent)
		@radio.buddyManager.registerListener(@handleBuddyManagerEvent)
		@init()
		
	handleRadioEvent: (name, data) =>
		if name == "tunedIn"
			@_applyStyle(data)
		else if name == "nowPlaying" and data.buddy != data.lastPlayingBuddy
			@_applyStyle(data.buddy)
			@_applyStyle(data.lastPlayingBuddy)
		else if name == "nobodyPlaying"
			@_applyStyle(data.lastPlayingBuddy)
		else if name == "tunedOut"
			@_applyStyle(data.buddy)
		else if name == "errorTuningIn" and data.reason == "disabled"
			alert("Can't tune in. #{data.buddy.username} has disabled access to his song listening data.")
		if name == "tunedOut" and data.reason == "disabled"
			alert("Radio for #{data.buddy.username} was stopped because the user has disabled access to his song listening data.")
	
	_applyStyle: (buddy) ->
		if buddy == null
			return
		el = $("li.sidebar_buddy[rel='#{buddy.network.className}-#{buddy.username}']")
		el.removeClass("buddy_nowplaying buddy_feedenabled buddy_live buddy_off buddy_disabled")
		classes = "buddy_#{buddy.listeningStatus}"
		if @radio.isFeedEnabled(buddy)
			classes += " buddy_feedenabled"
		if @radio.isOnAir(buddy)
			classes += " buddy_nowplaying"
		el.addClass(classes)
		
	handleBuddyManagerEvent: (name, data) =>
		if ["buddyRemoved", "buddyAdded", "statusChanged", "lastSongChanged", "buddiesLoaded"].indexOf(name) != -1
			@refresh()	
		
	init: () ->
		$("head").append("""
		<style type="text/css">
			#sidebar_buddyradio_wrapper .divider .sidebarHeading a {
				display: none;
			}
			#sidebar_buddyradio_wrapper .divider:hover .sidebarHeading a {
				display: inline;
			}
			.buddyradio_overlay {
				background: none repeat scroll 0 0 #FFFFFF;
				border: 1px solid rgba(0, 0, 0, 0.25);
				border-radius: 3px 3px 3px 3px;
				padding: 5px;
				color: black;
				max-height: 325px;
				overflow-x: hidden;
				overflow-y: auto;
				position: absolute;
				z-index: 9999;
			}
			.sidebar_buddy a .icon {
				/* Some icons by Yusuke Kamiyamane. All rights reserved. Licensed under Creative Commons Attribution 3.0. */
				background: url(data:image/png;base64,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)
				            no-repeat scroll 0 0 transparent;
			}
			.sidebar_buddy a:hover {
				background-color: #FFDFBF;
			}
			.sidebar_buddy a:hover .label {
				margin-right: 20px;
			}
			.sidebar_buddy a:hover .icon.remove {
				background-position: -16px -16px !important;
				display: block;
			}
			.sidebar_buddy a:active {
				background-color: #FF8000;
			}
			.sidebar_buddy a:active .label {
				color: #FFFFFF !important;
			}
			.sidebar_buddy a:active .icon.remove {
				background-position: -32px -16px;
				display: block;
			}
			.buddy_nowplaying a .icon {
				background-position: 0 0 !important;
			}
			.buddy_feedenabled a .label {
				font-weight: bold;
			}
			.buddy_live a .label, .buddy_live a:hover .label {
				color: #FF8000;
			}
			.buddy_live a .icon {
				background-position: -16px 0;
			}
			.buddy_off a .label, .buddy_off a:hover .label {
				color: black;
			}
			.buddy_off a .icon {
				background-position: -32px 0;
			}
			.buddy_disabled a .label, .buddy_disabled a:hover .label {
				color: gray;
			}
			.buddy_disabled a .icon {
				background-position: -48px 0;
			}
		</style>
		""")
	
		$("#sidebar .container_inner").append("""
		<div id="sidebar_buddyradio_wrapper" class="listWrapper">
            <div class="divider" style="display: block;">
                <span class="sidebarHeading">Buddy Radio
					<a id="buddyradio_settingsLink">&gt; Settings</a>
				</span>
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
			<div id="buddyradio_newuserform" style="position: absolute; top: #{position.top}px; left: #{position.left+20}px; display: block;width: 220px; height:40px" class="jjmenu">
				<div class="jj_menu_item">
					<div style="width: 100px;float:left" class="input_wrapper">
						<div class="cap">
							<input type="text" id="buddyradio_newuser" name="buddy" /> 
						</div>
					</div>
					<button id="buddyradio_adduserbutton" type="button" class="btn_style1" style="margin: 4px 0 0 5px">
						<span>Add Last.fm Buddy</span>
					</button>
					
				</div>
			</div>
			""")
			$("#buddyradio_newuser").focus()
			onConfirm = () =>
				@controller.addBuddy("Model.LastFmBuddyNetwork", $("#buddyradio_newuser")[0].value)
				$("#buddyradio_newuserform").remove()
			$("#buddyradio_adduserbutton").click(onConfirm)
			$("#buddyradio_newuser").keydown((event) =>
				if event.which == 13
					onConfirm()
			)
		)
		$("#buddyradio_settingsLink").click( () =>
			if $("#buddyradio_settingsform").length == 1
				$("#buddyradio_settingsform").remove()
				return
				
			position = newButton.offset()
			songsPerFeedInARow = @radio.getSongsPerFeedInARow()
			songsPerFeedInARowValues = [1,2,3,4,5,10,15,20,30,40,50,100]
			options = songsPerFeedInARowValues.map((n) ->
				sel = if songsPerFeedInARow == n then " selected" else ""
				"<option value=\"#{n}\"#{sel}>#{n}</option>"
			).join()
			
			$("body").append("""
			<div id="buddyradio_settingsform" style="position: absolute; top: #{position.top}px; left: #{position.left+20}px; display: block;width: 300px; height:60px" class="buddyradio_overlay">
				<div>
					Play 
					<select name="songsPerFeedInARow">
						#{options}
					</select>
					song/s in a row from same buddy
				</div>
				<div style="padding-top:10px">
					<button type="button" class="btn_style1">
						<span>Apply</span>
					</button>					
				</div>
			</div>
			""")
			$("#buddyradio_settingsform button").click(() =>
				count = $("#buddyradio_settingsform select[name=songsPerFeedInARow]")[0].value
				@controller.setSongsPerFeedInARow(parseInt(count))
				$("#buddyradio_settingsform").remove()
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
			if (status == "LIVE" or status == "OFF") and buddy.lastSong?
				song = "#{buddy.lastSong.artist} - #{buddy.lastSong.title}"
				if status == "LIVE"
					status += ", listening to: #{song}"
				else if status == "OFF" and buddy.lastSong?
					status += ", last listened to: #{song}"
			$("#sidebar_buddyradio").append("""
				<li title="#{buddy.username} (#{buddy.network.name}) - #{status}" rel="#{buddy.network.className}-#{buddy.username}" class="sidebar_buddy buddy sidebar_link">
					<a href="">
						<span class="icon remove"></span>
						<span class="icon"></span>
						<span class="label ellipsis">#{buddy.username}</span>
					</a>
				</li>
			""")
			@_applyStyle(buddy)
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
			
	setSongsPerFeedInARow: (count) ->
		if count? and count > 0
			@radio.setSongsPerFeedInARow(count)
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

