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