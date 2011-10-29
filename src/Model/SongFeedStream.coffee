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