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
			# the following check is necessary because feeds could've been removed
			# after calling feed.hasNext() in the while condition due to an "endOfFeed" event
			# a better way would be to introduce some kind of event queue
			if @feeds.length == 0
				return false
				
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