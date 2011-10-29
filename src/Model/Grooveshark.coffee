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
		# TODO cleanup() needs to be called in background continuously, otherwise it could get stuck if preloadCount>0
		#      -> not possible ATM because of missing spawn support
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
		   @queuedSongResources[0].length == null # null length is taken as an indicator that the song was never played
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
		