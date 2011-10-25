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