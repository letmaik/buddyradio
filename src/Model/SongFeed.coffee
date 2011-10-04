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