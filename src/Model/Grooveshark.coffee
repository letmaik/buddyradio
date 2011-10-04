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
			
		