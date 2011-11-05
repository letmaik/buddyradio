// ==UserScript==
// @name          BuddyRadio Debug
// @namespace     http://github.com/neothemachine/
// @include       http://grooveshark.com/*
// @include       http://preview.grooveshark.com/*
// ==/UserScript==

(function ()
{
	if (window.top != window.self)  // don't run on iframes
		return;
		
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
	# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

exports.start = () ->
	controller = new Controller.Radio([new Model.LastFmBuddyNetwork], [new Model.GroovesharkStreamingNetwork])
	new View.Grooveshark(controller)
	controller.start()
	
exports.classes = () ->
	{ Model, View, Controller }

http = require("apollo:http")
LastFmApi = require("apollo:lastfm")
LastFmApi.key = "53cda3b9d8760dbded7b4ca420b5abb2"

EOVR = new Error("must be overriden")
# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

Model = {}
# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

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
# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

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
	
	# fromTime, toTime: Date objects
	getHistoricFeed: (from, to) ->
		if not (from instanceof Date) or not (to instanceof Date)
			throw new Error("times must be given for historic feed")
		@network.getHistoricFeed(@username, from, to)
	
	# date = day (time will be ignored)
	hasHistoricData: (date) ->
		if not (date instanceof Date)
			throw new Error("date must be a Date object; time will be ignored")
		@network.hasHistoricData(@username, date)
		
	supportsHistoricFeed: () ->
		@listeningStatus != "disabled" and @network.getHistoricFeed?
	
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
# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

class Model.BuddyManager
	constructor: (@buddyNetworks) ->
	buddies: []
	storageKey: "buddyRadio_Buddies"
	eventListeners: []
	
	getBuddy: (buddyNetworkClassName, username) ->
		@buddies.filter((buddy) -> buddy.network.className == buddyNetworkClassName and buddy.username == username)[0]
	
	addBuddy: (buddyNetworkClassName, username, dontSave = false) ->
		if @buddies.some((buddy) -> buddy.network.className == buddyNetworkClassName and buddy.username == username)
			console.debug("user #{username} is already added")
			return
		console.debug("adding #{buddyNetworkClassName} user #{username}")
		
		network = @_findBuddyNetwork(buddyNetworkClassName)
		if network.isValid(username)
			buddy = new Model.Buddy(network, username)
			buddy.registerListener((name, data) => @_handleBuddyEvent(buddy, name, data))
			@buddies.push(buddy)
			if not dontSave
				@saveLocal()
			console.info("user #{username} added, informing listeners")
			listener("buddyAdded", buddy) for listener in @eventListeners
		else
			console.info("user #{username} not found")
			listener("buddyNotAdded", {username, reason: "notFound"}) for listener in @eventListeners
			
	removeBuddy: (buddyToBeRemoved) ->
		@buddies = @buddies.filter((buddy) -> buddy != buddyToBeRemoved)
		buddyToBeRemoved.dispose()
		@saveLocal()
		console.info("user #{buddyToBeRemoved.username} removed, informing listeners")
		listener("buddyRemoved", buddyToBeRemoved) for listener in @eventListeners
		
	importBuddies: (buddyNetworkClassName, username) ->
		network = @_findBuddyNetwork(buddyNetworkClassName)
		buddies = network.getBuddies(username)
		if buddies.error
			buddies
		else
			@addBuddy(buddyNetworkClassName, username, true) for username in buddies
			@saveLocal()
			true
		
	saveLocal: () -> 
		console.debug("saving buddies")
		reducedBuddies = ([buddy.network.className, buddy.username] for buddy in @buddies)
		localStorage[@storageKey] = JSON.stringify(reducedBuddies)
		listener("buddiesSaved") for listener in @eventListeners
	
	
	# TODO don't delete a buddy just because network failed (check for real not-found error!)
	loadLocal: () ->
		reducedBuddies = JSON.parse(localStorage[@storageKey] or "[]")
		@addBuddy(reducedBuddy[0], reducedBuddy[1], true) for reducedBuddy in reducedBuddies
		@saveLocal()
		listener("buddiesLoaded") for listener in @eventListeners
	
	registerListener: (listener) ->
		@eventListeners.push(listener)
		
	_handleBuddyEvent: (buddy, name, data) =>
		if ["statusChanged", "lastSongChanged"].indexOf(name) != -1
			listener(name, {buddy, data}) for listener in @eventListeners
			
	_findBuddyNetwork: (networkClassName) ->
		@buddyNetworks.filter((network) -> network.className == networkClassName)[0]
# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

# only a buddy gets a network and uses it (no one else calls it's methods!)
# exception: getBuddies() is called from BuddyManager to import existing buddies/friends
class Model.BuddyNetwork
	name: "Network Name" # used in links etc.
	className: "Model.XYZBuddyNetwork"
	isValid: (buddyId) -> throw EOVR
	getStatus: (buddyId) -> throw EOVR # live | off | disabled
	getInfo: (buddyId) -> throw EOVR
	getLastSong: (buddyId) -> throw EOVR
	getLiveFeed: (buddyId) -> throw EOVR
	# getHistoricFeed: (buddyId, from, to) # from, to = Date objects; implement in sub class if supported
	# hasHistoricData: (buddyId, date) # date = Date object; implement if getHistoricFeed() is implemented
	getBuddies: (buddyId) -> throw EOVR # returns array of buddyId's
	registerListener: (listener, buddyId) -> throw EOVR
	removeListener: (listener, buddyId) -> throw EOVR
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
# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

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
# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

class Model.SongFeed
	constructor: () ->
		@_eventListeners = []
	hasOpenEnd: () -> throw EOVR
	hasNext: () -> throw EOVR
	next: () -> throw EOVR
	registerListener: (listener) ->
		@_eventListeners.push(listener)
	
class Model.SequentialSongFeedCombinator extends Model.SongFeed
	constructor: (@feeds...) ->
		super()
		if @feeds.length == 0
			throw new Error("no feeds given!")
		@feededCount = 0
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
		@feededCount++
		@feeds[@_currentFeedIdx].next()
				
	addFeed: (feed) ->
		@feeds.push(feed)
		
class Model.AlternatingSongFeedCombinator extends Model.SongFeed
	constructor: (@songsPerFeedInARow = 1, @feeds...) ->
		super()
		@feededCount = 0
		@_currentFeedIdx = 0
		@_currentFeedSongsInARow = 0
		
	hasOpenEnd: () ->
		@feeds.some((feed) -> feed.hasOpenEnd())
		
	hasNext: () ->
		if @feeds.length == 0
			return false
		if @_currentFeedSongsInARow < @songsPerFeedInARow and @feeds[@_currentFeedIdx].hasNext()
			return true
		oldFeedIdx = @_currentFeedIdx
		@_moveToNextFeed()
		startIdx = @_currentFeedIdx
		while not @feeds[@_currentFeedIdx].hasNext()
			@_moveToNextFeed()
			if @_currentFeedIdx == startIdx
				return false
		if oldFeedIdx != @_currentFeedIdx
			@_currentFeedSongsInARow = 0
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
		@feededCount++
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
# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

class Model.SongFeedStream
	# preloadCount: if feed doesn't have an open end (=isn't live) then x songs will be preloaded/queued
	constructor: (@songFeed, @streamingNetworks, @preloadCount = 1) ->
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
							if @songFeed.hasOpenEnd() or @preloadCount == 0
								console.log("waiting")
								@_waitUntilEndOfQueue(0.9)
							else
								console.log("waiting until queue gets smaller (then: preload new song)")
								@_waitUntilQueueLessThanOrEqual(@preloadCount)
						else
							console.log("waiting 2")
							@_waitUntilEndOfQueue(1.0)
							@queue.push({song, resource: preferredResource})
							listener("songPlaying", song) for listener in @_eventListeners
							network.play(preferredResource)
							lastSongStreamedNetwork = network
							if not network.enqueue or @songFeed.hasOpenEnd() or @preloadCount == 0
								console.log("waiting 3")
								@_waitUntilEndOfQueue(0.9)
					else
						# TODO noSongFound event
						continue # with next song in feed without waiting
		else
			waitfor rv
				@_stopRequestCall = resume
			return { status: "stopRequest" }
	
	_waitUntilQueueLessThanOrEqual: (count) ->
		while @queue.length > count
			console.debug("holding on... #{@queue.length} songs in queue (target: #{count})")
			hold(5000)
	
	_waitUntilEndOfQueue: (factor) ->
		@_waitUntilQueueLessThanOrEqual(1)
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
				
	dispose: () ->
		if not @stopRequest
			throw new Error("can only dispose after streaming was stopped")
		network.removeListener(@_handleStreamingNetworkEvent) for network in @streamingNetworks
		@_eventListeners = []
# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

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
# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

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
		waitfor
			while not Grooveshark?
				console.debug("Grooveshark JS API not available yet, waiting...")
				hold(500)
		else
			hold(10000)
			throw new Error("Grooveshark JS API not available")
		if not (Grooveshark.addSongsByID? and Grooveshark.setSongStatusCallback? and Grooveshark.pause? and Grooveshark.removeCurrentSongFromQueue?)
			throw new Error("Grooveshark API has changed")
		Grooveshark.setSongStatusCallback(@handleGroovesharkEvent)
		
		spawn @_doPeriodicCleanup()

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
	
	# used for detecting enqueue failures (play()-failures get detected instantly)
	currentSongShouldHaveStartedAt: null # timestamp
	
	lastFailedSongResource: null
	
	play: (songResource, dontRetry = false) ->
		console.debug("playing... Grooveshark songID #{songResource.songId}")
		Grooveshark.addSongsByID([songResource.songId])
		if not @_skipTo(songResource.songId)
			if dontRetry
				listener("streamingSkipped", songResource) for listener in @eventListeners
				return
			console.info("trying to add song one more time...")
			Grooveshark.addSongsByID([songResource.songId])
			if not @_skipTo(songResource.songId)
				console.error("nope, still not working... skipping this song now")
				listener("streamingSkipped", songResource) for listener in @eventListeners
				return
		@currentSongShouldHaveStartedAt = Date.now()
		@queuedSongResources.push(songResource)
		@_playIfPaused()
	
	# skip songs which are in the queue
	_skipTo: (songId) ->
		waitfor
			while Grooveshark.getCurrentSongStatus().song?.songID != songId
				console.debug("skipping to next song to get to the current one")
				Grooveshark.next()
				hold(1000)
			return true
		else
			hold(10000)
			console.warn("couldn't skip to current song in Grooveshark player")
			return false
		
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
			if resources.length == 1 and resources[0].length? and Math.round(gsSong.calculatedDuration) > resources[0].length
				console.debug("song length corrected from #{resources[0].length}ms to #{Math.round(gsSong.calculatedDuration)}ms")
				resources[0].length = Math.round(gsSong.calculatedDuration)
			
			gsSong.position
		else
			null

	_doPeriodicCleanup: () ->
		loop
			@_cleanup()
			hold(5000)
			
	_cleanup: () ->
		# sometimes grooveshark doesn't add and play a song when calling addSongsByID()
		# this leaves our queue in an inconsistent state so we have to clean it up now and then
		if @queuedSongResources.length > 0 and
		   not @queuedSongResources[0].length? and # null length is taken as an indicator that the song was never played
		   @currentSongShouldHaveStartedAt?
			if (Date.now() - @currentSongShouldHaveStartedAt) > 10000
				console.warn("grooveshark got stuck... trying to re-add current song")
				resource = @queuedSongResources.shift()
				oldDate = @currentSongShouldHaveStartedAt
				# if current song got stuck indefinitely in loading state, 
				# then remove it first, so that skipping logic in play() works when adding the song again
				if Grooveshark.getCurrentSongStatus().song?.songID == resource.songId
					Grooveshark.removeCurrentSongFromQueue()
				@play(resource, true)
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
			@currentSongShouldHaveStartedAt = Date.now()
		
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
				@play(resource, true)
		
# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

class Model.LastFmBuddyNetwork extends Model.BuddyNetwork
	name: "Last.fm"
	className: "Model.LastFmBuddyNetwork"
	
	constructor: () ->
		spawn @_periodicUpdate()
			
	_periodicUpdate: () ->
		loop
			@_updateListeningData(username) for username in Object.keys(@_eventListeners)
			hold(60000)
		null

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
		@feededCount = 0
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
		@feededCount++
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
		@totalCount = response["@attr"].total

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
# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

View = {}
# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

class View.Grooveshark
	constructor: (controller) ->
		if $("#header_mainNavigation").length == 1
			new View.GroovesharkV2(controller)
		else if $("#sidebar .container_inner").length == 1
			new View.GroovesharkV1(controller)
		else
			throw new Error("Couldn't detect version of Grooveshark")
# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

class View.GroovesharkV1
	constructor: (@controller) ->
		@radio = @controller.radio
		@radio.registerListener(@handleRadioEvent)
		@radio.buddyManager.registerListener(@handleBuddyManagerEvent)
		@init()
		
		# don't know of any better method
		@_cprInProgress = false
		@_lifesLeft = 9
		$(document).bind("DOMNodeRemoved", (e) =>
			# can't check for e.target.id, because 'sidebar_buddyradio_wrapper' never appears
			if $("#sidebar_buddyradio_wrapper").length == 0 and not @_cprInProgress and @_lifesLeft > 0
				@_cprInProgress = true
				console.warn("OMG! We were killed!")
				hold(1000)
				@_lifesLeft--
				console.warn("Phew... #{@_lifesLeft} lifes left")
				@init()
				@refresh()
				@_cprInProgress = false
		)
		
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
	
	handleBuddyManagerEvent: (name, data) =>
		if ["buddyRemoved", "buddyAdded", "statusChanged", "lastSongChanged", "buddiesLoaded"].indexOf(name) != -1
			@refresh()
		if name == "buddyNotAdded"
			if data.reason == "notFound"
				alert("The buddy with username #{data.username} couldn't be found.")
	
	_applyStyle: (buddy) ->
		if not buddy?
			return
		el = $("li.sidebar_buddy[rel='#{buddy.network.className}-#{buddy.username}']")
		el.removeClass("buddy_nowplaying buddy_feedenabled buddy_feedenabled_historic buddy_live buddy_off buddy_disabled")
		classes = "buddy_#{buddy.listeningStatus}"
		if @radio.isFeedEnabled(buddy)
			classes += " buddy_feedenabled"
			if @radio.getFeedType(buddy) == "historic"
				classes += " buddy_feedenabled_historic"
		if @radio.isOnAir(buddy)
			classes += " buddy_nowplaying"
		el.addClass(classes)
		
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
			.sidebar_buddy a .icon:hover, .sidebar_buddy.buddy_nowplaying.buddy_feedenabled_historic a .icon:hover {
				background-position: -64px 0 !important;
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
				background-position: -32px -16px !important;
				display: block;
			}
			.buddy_nowplaying a .icon {
				background-position: 0 0 !important;
			}
			.buddy_nowplaying.buddy_feedenabled_historic a .icon {
				background-position: -80px -16px !important;
			}
			.buddy_feedenabled.buddy_feedenabled_historic a .icon {
				background-position: -80px 0;
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
					<a id="buddyradio_settingsLink">Settings</a>
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
			<div id="buddyradio_newuserform" style="position: absolute; top: #{position.top}px; left: #{position.left+20}px; display: block;width: auto; height: 80px;" class="jjmenu">
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
				<div class="jj_menu_item" style="clear:both">
					<div class="input_wrapper" style="width: 100px; float: left;">
						<div class="cap">
							<input type="text" name="buddy" id="buddyradio_importusers"> 
						</div>
					</div>
					<button style="margin: 4px 0pt 0pt 5px;" class="btn_style1" type="button" id="buddyradio_importusersbutton">
						<span>Import my Last.fm Buddies</span>
					</button>
					
				</div>
			</div>
			""")
			$("#buddyradio_newuser").focus()
			onConfirmAddBuddy = () =>
				$("#buddyradio_adduserbutton span").html("Adding Buddy...")
				@controller.addBuddy("Model.LastFmBuddyNetwork", $("#buddyradio_newuser")[0].value)
				$("#buddyradio_newuserform").remove()
			$("#buddyradio_adduserbutton").click(onConfirmAddBuddy)
			$("#buddyradio_newuser").keydown((event) =>
				if event.which == 13
					onConfirmAddBuddy()
			)
			onConfirmImportBuddies = () =>
				username = $("#buddyradio_importusers")[0].value
				if not username
					alert("You need to enter the user name from which you want to import the Last.fm buddies.")
					return
				$("#buddyradio_importusersbutton span").html("Importing Buddies...")
				result = @controller.importBuddies("Model.LastFmBuddyNetwork", username)
				if result.error == "invalid_user"
					alert("The user name you entered doesn't exist on Last.fm!")
				$("#buddyradio_newuserform").remove()
			$("#buddyradio_importusersbutton").click(onConfirmImportBuddies)
			$("#buddyradio_importusers").keydown((event) =>
				if event.which == 13
					onConfirmImportBuddies()
			)
		)
		$("#buddyradio_settingsLink").click( () =>
			if $("#buddyradio_settingsform").length == 1
				$("#buddyradio_settingsform").remove()
				return
				
			position = newButton.offset()
			
			songsPerFeedInARowValues = [1,2,3,4,5,10,15,20,30,40,50,100]
			optionsSongsPerFeed = @_constructOptions(songsPerFeedInARowValues, @radio.getSongsPerFeedInARow())
			
			optionsPreload = @_constructOptions([0..5], @radio.getPreloadCount())
			
			$("body").append("""
			<div id="buddyradio_settingsform" style="position: absolute; top: #{position.top}px; left: #{position.left+20}px; display: block;width: 310px" class="buddyradio_overlay">
				<div>
					Play 
					<select name="songsPerFeedInARow">
						#{optionsSongsPerFeed}
					</select>
					song/s in a row from same buddy
				</div>
				<div style="margin-top: 5px">
					Preload
					<select name="preloadCount">
						#{optionsPreload}
					</select>
					song/s when playing historic radio
				</div>
				<div style="padding-top:10px">
					<button type="button" class="btn_style1">
						<span>Apply</span>
					</button>					
				</div>
				<div style="margin-top:10px; float:right; text-align:right">
					BuddyRadio v0.3<br />
					<a href="http://neothemachine.github.com/buddyradio" target="_blank">Project Page</a>
				</div>
			</div>
			""")
			$("#buddyradio_settingsform button").click(() =>
				songsPerFeed = $("#buddyradio_settingsform select[name=songsPerFeedInARow]")[0].value
				preloadCount = $("#buddyradio_settingsform select[name=preloadCount]")[0].value		
				@controller.setSongsPerFeedInARow(parseInt(songsPerFeed))
				@controller.setPreloadCount(parseInt(preloadCount))
				$("#buddyradio_settingsform").remove()
			)
		)
	
	_constructOptions: (options, selected = null) ->
		options.map((n) ->
			sel = if selected == n then " selected" else ""
			"<option value=\"#{n}\"#{sel}>#{n}</option>"
		).join()
		
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
				<li rel="#{buddy.network.className}-#{buddy.username}" class="sidebar_buddy buddy sidebar_link">
					<a href="">
						<span class="icon remove"></span>
						<span class="icon more"></span>
						<span class="label ellipsis" title="#{buddy.username} (#{buddy.network.name}) - #{status}">#{buddy.username}</span>
					</a>
				</li>
			""")
			@_applyStyle(buddy)
		) for buddy in sortedBuddies
		
		$("li.sidebar_buddy .more").click((event) =>
			event.preventDefault()
			event.stopPropagation()
			entry = $(event.currentTarget).parent().parent()
			[networkClassName, username] = entry.attr("rel").split("-")
			@_showMoreMenu(networkClassName, username)
		)
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
	
	_currentlyOpenedMenu: null
	
	_showMoreMenu: (networkClassName, username) =>
		buddy = @controller.getBuddy(networkClassName, username)
		if $("#buddyradio_more").length == 1
			$("#buddyradio_more").remove()
			if @_currentlyOpenedMenu == buddy
				@_currentlyOpenedMenu = null
				return
		@_currentlyOpenedMenu = buddy
		position = $("li.sidebar_buddy[rel='#{networkClassName}-#{username}'] .more").offset()
		if not position?
			return
		
		feedInfo = ""
		if @radio.isFeedEnabled(buddy)
			feedType = @radio.getFeedType(buddy)
			feedInfo = """
				<div style="margin-bottom:10px">Tuned into <strong>#{feedType}</strong> radio.<br />
			"""
			if feedType == "historic"
				feedInfo += "#{@radio.getAlreadyFeededCount(buddy)} of #{@radio.getTotalCountForHistoricFeed(buddy)} songs enqueued so far."
			else
				feedInfo += "#{@radio.getAlreadyFeededCount(buddy)} songs enqueued so far."
			feedInfo += "</div>"
				
		$("body").append("""
		<div id="buddyradio_more" style="position: absolute; top: #{position.top}px; left: #{position.left+20}px; display: block;width: 260px" class="buddyradio_overlay">
			#{feedInfo}
			<div class="buttons">
				<img style="float:left; padding-right:10px;" src="#{buddy.avatarUrl}" />
				<button type="button" class="btn_style1 viewprofile">
					<span>View Profile on #{buddy.network.name}</span>
				</button>
			</div>
		</div>
		""")
		$("#buddyradio_more button.viewprofile").click(() =>
			# FIXME scrolls current page to top, why??
			window.open(buddy.profileUrl)
			$("#buddyradio_more").remove()
			@_currentlyOpenedMenu = null
		)
		
		if buddy.supportsHistoricFeed()
			$("#buddyradio_more div.buttons").append("""
				<button style="margin-top: 5px" type="button" class="btn_style1 fetchlastweek">
					<span>Listen previously played songs</span>
				</button>
			""")
			$("#buddyradio_more").append("""
				<div class="lastweekdata" style="clear:both"></div>
			""")
			$("#buddyradio_more button.fetchlastweek").click(() =>
				$("#buddyradio_more button.fetchlastweek span").html("Checking last week's songs...")
				# check last 7 days for song data
				el = $("#buddyradio_more .lastweekdata")
				today = new Date()
				todaysDay = today.getDate()
				(
					date = new Date(today.getFullYear(), today.getMonth(), day)
					if buddy.hasHistoricData(date)
						
						# TODO read out song count of that day and display it here: "Listen 123 songs from.."
						
						el.append("""
						<a rel="#{date.getTime()}">Listen songs from #{date.toDateString()}</a><br />
						""")
					else
						el.append("No songs played #{date.toDateString()}<br />")
				) for day in [todaysDay...todaysDay-7]
			
				$("#buddyradio_more button.fetchlastweek").remove()
				$("#buddyradio_more .lastweekdata a").click((event) =>
					$("#buddyradio_more").remove()
					from = new Date(parseInt($(event.currentTarget).attr("rel")))
					to = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 23, 59, 59)
					@controller.tuneHistoric(networkClassName, username, from, to)					
				)
			)
# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

class View.GroovesharkV2
	constructor: (@controller) ->
		@radio = @controller.radio
		@radio.registerListener(@handleRadioEvent)
		@radio.buddyManager.registerListener(@handleBuddyManagerEvent)
		@init()
		
		# don't know of any better method
		@_cprInProgress = false
		$(document).bind("DOMNodeRemoved", (e) =>
			# can't check for e.target.id, because 'sidebar_buddyradio_wrapper' never appears
			if $("#sidebar_buddyradio_wrapper").length == 0 and $("#sidebar_pinboard").length == 1 and not @_cprInProgress
				@_cprInProgress = true
				hold(1000)
				@init()
				@refresh()
				@_cprInProgress = false
		)
		
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
	
	handleBuddyManagerEvent: (name, data) =>
		if ["buddyRemoved", "buddyAdded", "statusChanged", "lastSongChanged", "buddiesLoaded"].indexOf(name) != -1
			@refresh()
		if name == "buddyNotAdded"
			if data.reason == "notFound"
				alert("The buddy with username #{data.username} couldn't be found.")
	
	_applyStyle: (buddy) ->
		if not buddy?
			return
		el = $("a.sidebar_buddy[rel='#{buddy.network.className}-#{buddy.username}']")
		el.removeClass("buddy_nowplaying buddy_feedenabled buddy_feedenabled_historic buddy_live buddy_off buddy_disabled")
		classes = "buddy_#{buddy.listeningStatus}"
		if @radio.isFeedEnabled(buddy)
			classes += " buddy_feedenabled"
			if @radio.getFeedType(buddy) == "historic"
				classes += " buddy_feedenabled_historic"
		if @radio.isOnAir(buddy)
			classes += " buddy_nowplaying"
		el.addClass(classes)
		
	init: () ->
		$("head").append("""
		<style type="text/css">
			#sidebar_buddyradio_wrapper {
				display: block;
			}
			.buddyradio_overlay {
				background: none repeat scroll 0 0 #F5F5F5;
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
			a.sidebar_buddy .icon {
				/* Some icons by Yusuke Kamiyamane. All rights reserved. Licensed under Creative Commons Attribution 3.0. */
				background: url(data:image/png;base64,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)
				            no-repeat scroll 0 0 transparent;
			}
			a.sidebar_buddy .icon:hover, a.sidebar_buddy.buddy_nowplaying.buddy_feedenabled_historic .icon:hover {
				background-position: -64px 0 !important;
			}
			a.sidebar_buddy:hover .label {
				margin-right: 20px;
			}
			a.sidebar_buddy:hover .icon.remove {
				background-position: -48px -16px !important;
				display: block;
			}
			a.sidebar_buddy:hover .icon.remove:hover {
				background-position: -64px -16px !important;
				display: block;
			}
			a.buddy_nowplaying .icon {
				background-position: 0 0 !important;
			}
			a.buddy_nowplaying.buddy_feedenabled_historic .icon {
				background-position: -80px -16px !important;
			}
			a.buddy_feedenabled.buddy_feedenabled_historic .icon {
				background-position: -80px 0;
			}
			a.buddy_feedenabled .label {
				font-weight: bold;
			}
			a.buddy_live .label, a.buddy_live:hover .label {
				color: #FF8000;
			}
			a.buddy_live .icon {
				background-position: -16px 0;
			}
			a.buddy_off .label, a.buddy_off:hover .label {
				color: black;
			}
			a.buddy_off .icon {
				background-position: -32px 0;
			}
			a.buddy_disabled .label, a.buddy_disabled:hover .label {
				color: gray;
			}
			a.buddy_disabled .icon {
				background-position: -48px 0;
			}
		</style>
		""")
	
		$("#sidebar_pinboard .overview").append("""
		<a id="sidebar_buddyradio_divider" class="sidebar_pin_divider">
			<span class="sidebar_pin_collapse"></span>
			<span class="sidebar_pin_heading">Buddy Radio</span>
		</a>
		<div id="sidebar_buddyradio_wrapper" class="sidebar_pin_group">
            <div id="sidebar_buddyradio" class="link_group">
				<span class="buddyradio_users">
					<span class="label ellipsis">loading...</span>
				</span>				
				<a class="sidebar_link" id="buddyradio_addLink">
					<span class="label">Add...</span>
				</a>
				<a class="sidebar_link" id="buddyradio_settingsLink">
					<span class="label">Settings</span>
				</a>
			</div>	
        </div>
		""")
		newButton = $("#buddyradio_addLink")
		newButton.click( () =>
			if $("#buddyradio_newuserform").length == 1
				$("#buddyradio_newuserform").remove()
				return
				
			position = newButton.offset()
			$("body").append("""
			<div id="buddyradio_newuserform" style="position: absolute; top: #{position.top+20}px; left: #{position.left+20}px; display: block;width: auto; height: 80px;" class="jjmenu">
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
				<div class="jj_menu_item" style="clear:both">
					<div class="input_wrapper" style="width: 100px; float: left;">
						<div class="cap">
							<input type="text" name="buddy" id="buddyradio_importusers"> 
						</div>
					</div>
					<button style="margin: 4px 0pt 0pt 5px;" class="btn_style1" type="button" id="buddyradio_importusersbutton">
						<span>Import my Last.fm Buddies</span>
					</button>
					
				</div>
			</div>
			""")
			$("#buddyradio_newuser").focus()
			onConfirmAddBuddy = () =>
				$("#buddyradio_adduserbutton span").html("Adding Buddy...")
				@controller.addBuddy("Model.LastFmBuddyNetwork", $("#buddyradio_newuser")[0].value)
				$("#buddyradio_newuserform").remove()
			$("#buddyradio_adduserbutton").click(onConfirmAddBuddy)
			$("#buddyradio_newuser").keydown((event) =>
				if event.which == 13
					onConfirmAddBuddy()
			)
			onConfirmImportBuddies = () =>
				username = $("#buddyradio_importusers")[0].value
				if not username
					alert("You need to enter the user name from which you want to import the Last.fm buddies.")
					return
				$("#buddyradio_importusersbutton span").html("Importing Buddies...")
				result = @controller.importBuddies("Model.LastFmBuddyNetwork", username)
				if result.error == "invalid_user"
					alert("The user name you entered doesn't exist on Last.fm!")
				$("#buddyradio_newuserform").remove()
			$("#buddyradio_importusersbutton").click(onConfirmImportBuddies)
			$("#buddyradio_importusers").keydown((event) =>
				if event.which == 13
					onConfirmImportBuddies()
			)
		)
		$("#buddyradio_settingsLink").click( () =>
			if $("#buddyradio_settingsform").length == 1
				$("#buddyradio_settingsform").remove()
				return
				
			position = $("#buddyradio_settingsLink").offset()
			
			songsPerFeedInARowValues = [1,2,3,4,5,10,15,20,30,40,50,100]
			optionsSongsPerFeed = @_constructOptions(songsPerFeedInARowValues, @radio.getSongsPerFeedInARow())
			
			optionsPreload = @_constructOptions([0..5], @radio.getPreloadCount())
			
			$("body").append("""
			<div id="buddyradio_settingsform" style="position: absolute; top: #{position.top+20}px; left: #{position.left+20}px; display: block;width: 310px" class="buddyradio_overlay">
				<div>
					Play 
					<select name="songsPerFeedInARow">
						#{optionsSongsPerFeed}
					</select>
					song/s in a row from same buddy
				</div>
				<div style="margin-top: 5px">
					Preload
					<select name="preloadCount">
						#{optionsPreload}
					</select>
					song/s when playing historic radio
				</div>
				<div style="padding-top:10px">
					<button type="button" class="btn_style1">
						<span>Apply</span>
					</button>					
				</div>
				<div style="margin-top:10px; float:right; text-align:right">
					BuddyRadio v0.3<br />
					<a href="http://neothemachine.github.com/buddyradio" target="_blank">Project Page</a>
				</div>
			</div>
			""")
			$("#buddyradio_settingsform button").click(() =>
				songsPerFeed = $("#buddyradio_settingsform select[name=songsPerFeedInARow]")[0].value
				preloadCount = $("#buddyradio_settingsform select[name=preloadCount]")[0].value		
				@controller.setSongsPerFeedInARow(parseInt(songsPerFeed))
				@controller.setPreloadCount(parseInt(preloadCount))
				$("#buddyradio_settingsform").remove()
			)
		)
	
	_constructOptions: (options, selected = null) ->
		options.map((n) ->
			sel = if selected == n then " selected" else ""
			"<option value=\"#{n}\"#{sel}>#{n}</option>"
		).join()
		
	refresh: () ->
		console.debug("refreshing view")
		$("#sidebar_buddyradio .buddyradio_users").empty()
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
			$("#sidebar_buddyradio .buddyradio_users").append("""
				<a rel="#{buddy.network.className}-#{buddy.username}" class="sidebar_buddy buddy sidebar_link">
					<span class="icon remove"></span>
					<span class="icon more"></span>
					<span class="label ellipsis" title="#{buddy.username} (#{buddy.network.name}) - #{status}">#{buddy.username}</span>
				</a>
			""")
			@_applyStyle(buddy)
		) for buddy in sortedBuddies
		
		$("a.sidebar_buddy .more").click((event) =>
			event.preventDefault()
			event.stopPropagation()
			entry = $(event.currentTarget).parent()
			[networkClassName, username] = entry.attr("rel").split("-")
			@_showMoreMenu(networkClassName, username)
		)
		$("a.sidebar_buddy .remove").click((event) =>
			event.preventDefault()
			event.stopPropagation()
			[networkClassName, username] = $(event.currentTarget).parent().attr("rel").split("-")
			@controller.removeBuddy(networkClassName, username)
		)
		$("a.sidebar_buddy").click((event) =>
			event.preventDefault()
			[networkClassName, username] = $(event.currentTarget).attr("rel").split("-")
			@controller.tune(networkClassName, username)
		)
	
	_currentlyOpenedMenu: null
	
	_showMoreMenu: (networkClassName, username) =>
		buddy = @controller.getBuddy(networkClassName, username)
		if $("#buddyradio_more").length == 1
			$("#buddyradio_more").remove()
			if @_currentlyOpenedMenu == buddy
				@_currentlyOpenedMenu = null
				return
		@_currentlyOpenedMenu = buddy
		position = $("a.sidebar_buddy[rel='#{networkClassName}-#{username}'] .more").offset()
		if not position?
			return
		
		feedInfo = ""
		if @radio.isFeedEnabled(buddy)
			feedType = @radio.getFeedType(buddy)
			feedInfo = """
				<div style="margin-bottom:10px">Tuned into <strong>#{feedType}</strong> radio.<br />
			"""
			if feedType == "historic"
				feedInfo += "#{@radio.getAlreadyFeededCount(buddy)} of #{@radio.getTotalCountForHistoricFeed(buddy)} songs enqueued so far."
			else
				feedInfo += "#{@radio.getAlreadyFeededCount(buddy)} songs enqueued so far."
			feedInfo += "</div>"
				
		$("body").append("""
		<div id="buddyradio_more" style="position: absolute; top: #{position.top+20}px; left: #{position.left+20}px; display: block;width: 260px" class="buddyradio_overlay">
			#{feedInfo}
			<div class="buttons">
				<img style="float:left; padding-right:10px;" src="#{buddy.avatarUrl}" />
				<button type="button" class="btn_style1 viewprofile">
					<span>View Profile on #{buddy.network.name}</span>
				</button>
			</div>
		</div>
		""")
		$("#buddyradio_more button.viewprofile").click(() =>
			# FIXME scrolls current page to top, why??
			window.open(buddy.profileUrl)
			$("#buddyradio_more").remove()
			@_currentlyOpenedMenu = null
		)
		
		if buddy.supportsHistoricFeed()
			$("#buddyradio_more div.buttons").append("""
				<button style="margin-top: 5px" type="button" class="btn_style1 fetchlastweek">
					<span>Listen previously played songs</span>
				</button>
			""")
			$("#buddyradio_more").append("""
				<div class="lastweekdata" style="clear:both"></div>
			""")
			$("#buddyradio_more button.fetchlastweek").click(() =>
				$("#buddyradio_more button.fetchlastweek span").html("Checking last week's songs...")
				# check last 7 days for song data
				el = $("#buddyradio_more .lastweekdata")
				today = new Date()
				todaysDay = today.getDate()
				(
					date = new Date(today.getFullYear(), today.getMonth(), day)
					if buddy.hasHistoricData(date)
						
						# TODO read out song count of that day and display it here: "Listen 123 songs from.."
						
						el.append("""
						<a rel="#{date.getTime()}">Listen songs from #{date.toDateString()}</a><br />
						""")
					else
						el.append("No songs played #{date.toDateString()}<br />")
				) for day in [todaysDay...todaysDay-7]
			
				$("#buddyradio_more button.fetchlastweek").remove()
				$("#buddyradio_more .lastweekdata a").click((event) =>
					$("#buddyradio_more").remove()
					from = new Date(parseInt($(event.currentTarget).attr("rel")))
					to = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 23, 59, 59)
					@controller.tuneHistoric(networkClassName, username, from, to)					
				)
			)
# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

Controller = {}

class Controller.Radio
	constructor: (@buddyNetworks, @streamingNetworks) ->
		@radio = new Model.Radio(@buddyNetworks, @streamingNetworks)
	
	start: () ->
		@radio.buddyManager.loadLocal()
		
	addBuddy: (networkClassName, username) ->
		if networkClassName and username
			@radio.buddyManager.addBuddy(networkClassName, username)
		
	removeBuddy: (networkClassName, username) ->
		if networkClassName and username
			@radio.buddyManager.removeBuddy(@radio.buddyManager.getBuddy(networkClassName, username))
			
	getBuddy: (networkClassName, username) ->
		if networkClassName and username
			@radio.buddyManager.getBuddy(networkClassName, username)
			
	importBuddies: (networkClassName, username) ->
		if networkClassName and username
			@radio.buddyManager.importBuddies(networkClassName, username)
		
	tune: (networkClassName, username) ->
		if networkClassName and username
			@radio.tune(@radio.buddyManager.getBuddy(networkClassName, username))
	
	tuneHistoric: (networkClassName, username, from, to) ->
		if networkClassName and username and from instanceof Date and to instanceof Date
			@radio.tune(@radio.buddyManager.getBuddy(networkClassName, username), from, to)
			
	setSongsPerFeedInARow: (count) ->
		if count? and count > 0
			@radio.setSongsPerFeedInARow(count)
	
	setPreloadCount: (count) ->
		if count? and count >= 0
			@radio.setPreloadCount(count)
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
})();
