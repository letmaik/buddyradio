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

# START
	
exports.start = () ->
	controller = new Controller.Radio([new Model.LastFmBuddyNetwork], [new Model.GroovesharkStreamingNetwork])
	controller.start()

http = require("apollo:http")
LastFmApi = require("apollo:lastfm");
LastFmApi.key = "53cda3b9d8760dbded7b4ca420b5abb2"
	
Model = {}

# TODO Feature Idea: in addition to live-listening it would be cool to listen to previous timespans of the buddy
#                    because it's often the case that the buddy isn't listening at the very moment -> Live mode, History mode
	
class Model.SongResource
	constructor: () ->
		@length = null # song length in ms | null if unknown (yet)
	
class Model.GroovesharkSongResource extends Model.SongResource
	constructor: (@songId) ->
		
class Model.Song
	constructor: (@artist, @title, @listenedAt) -> # unix timestamp in s | null if current song
		if not @listenedAt?
			@listenedAt = Math.round(Date.now() / 1000)
		@resources = null # null = not searched yet; [] = no resources found

# TODO there is a short timespan in between two songs where the user appears offline because at this very moment
#      and until the new song status was transmitted by e.g. last.fm client the user isn't "listening" to anything
#      -> maybe apply new data when status is "off" only after second time "off" (i.e. remember it!)
#       -> probably responsibility of specific BuddyNetwork class
class Model.Buddy
	constructor: (@network, @username, @avatarUrl, @profileUrl) ->
		@listeningStatus = "off" # live | off | disabled
		@currentSong = null
		@pastSongs = []
		@lastRefreshedAt = 0 # timestamp in ms
		@eventListeners = []
		@refreshListeningData()
	
	refreshListeningData: (force = false) ->
		if not force and (Date.now() - @lastRefreshedAt) < 30000
			console.log("skipped refreshing of #{@username}; last refreshed #{Date.now() - @lastRefreshedAt} ms ago")
			return
		@lastRefreshedAt = Date.now()
		data = @network.loadListeningData(@username)
		@listeningStatus = data.listeningStatus
		# only update if new song (so that listenedAt doesn't get reset otherwise)
		if @currentSong? and data.currentSong?
			if @currentSong.artist != data.currentSong.artist or 
			   @currentSong.title != data.currentSong.title or
			   (@pastSongs.length > 0 and @pastSongs[0].listenedAt != data.pastSongs[0].listenedAt)
				@currentSong = data.currentSong			
		else
			@currentSong = data.currentSong
		@pastSongs = data.pastSongs
		listener("listeningDataRefreshed", {buddy: @, forced: force}) for listener in @eventListeners # TODO only call if really changed
		
	registerListener: (listener) ->
		@eventListeners.push(listener)

class Model.BuddyNetwork
	name: "Network Name" # used in links etc.
	className: "Model.XYZBuddyNetwork"
	loadBuddy: (buddyId) -> throw new Error("must be overriden")
	loadListeningData: (buddyId) -> throw new Error("must be overriden")
	
class Model.LastFmBuddyNetwork extends Model.BuddyNetwork
	name: "Last.fm"
	className: "Model.LastFmBuddyNetwork"
	
	loadBuddy: (username) ->
		user = null
		try
			user = LastFmApi.get({ method: "user.getInfo", user: username})
		catch e
			console.log(e)
			return
		new Model.Buddy(this, user.name, user.image[0]["#text"], user.url)
	
	loadListeningData: (username) ->
		console.log("getting recent tracks from Last.fm for #{username}")
		response = null
		try 
			response = LastFmApi.get({method: "user.getRecentTracks", user: username})
		catch e
			if e.code == 4
				return {listeningStatus: "disabled", currentSong: null, pastSongs: []}
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
		listeningStatus = if currentSong? then "live" else "off"
		{listeningStatus, currentSong, pastSongs}
		
class Model.BuddyManager
	constructor: (@buddyNetworks) ->
	buddies: []
	storageKey: "buddyRadio_Buddies"
	eventListeners: []
	
	getBuddy: (buddyNetworkClassName, username) ->
		@buddies.filter((buddy) -> buddy.network.className == buddyNetworkClassName and buddy.username == username)[0]
	
	addBuddy: (buddyNetworkClassName, username) ->
		if @buddies.some((buddy) -> buddy.network.className == buddyNetworkClassName and buddy.username == username)
			console.log("user #{username} is already added")
			return
		console.log("adding #{buddyNetworkClassName} user #{username}")
		buddy = @_findBuddyNetwork(buddyNetworkClassName).loadBuddy(username)
		if buddy?
			buddy.registerListener(@handleBuddyEvent)
			@buddies.push(buddy)
			@saveLocal()
			console.log("user #{username} added, informing listeners")
			listener("buddyAdded", buddy) for listener in @eventListeners
		else
			console.log("user #{username} not found")
			
	removeBuddy: (buddyToBeRemoved) ->
		@buddies = @buddies.filter((buddy) -> buddy != buddyToBeRemoved)
		@saveLocal()
		console.log("user #{buddyToBeRemoved.username} removed, informing listeners")
		listener("buddyRemoved", buddyToBeRemoved) for listener in @eventListeners
			
	refreshListeningData: () ->
		buddy.refreshListeningData() for buddy in @buddies
		listener("listeningDataRefreshed") for listener in @eventListeners
		
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
		if name == "listeningDataRefreshed" and data.forced
			listener("listeningDataForcefullyRefreshed", data.buddy) for listener in @eventListeners
		# TODO also inform listeners on non-forced update (otherwise there is a lag when streaming logic itself fetched new buddy data)
		#      -> be careful about too much callback noise and UI refreshes etc.
		
	_findBuddyNetwork: (networkClassName) ->
		@buddyNetworks.filter((network) -> network.className == networkClassName)[0]

class Model.StreamingNetwork
	constructor: () ->
		@eventListeners = []
		
	registerListener: (listener) ->
		@eventListeners.push(listener)
		
	findSongResource: (artist, title) -> throw new Error("must be overriden")
	canPlay: (songResource) -> throw new Error("must be overriden") # true if this network can handle the specific resource
	play: (songResource) -> throw new Error("must be overriden")
	stop: () -> throw new Error("must be overriden")
	# declare "enqueue: (songResource) ->" in subclass if network supports enqueueing
		
class Model.GroovesharkStreamingNetwork extends Model.StreamingNetwork
	constructor: () ->
		super()
		if not (Grooveshark.addSongsByID? and Grooveshark.setSongStatusCallback? and Grooveshark.pause? and Grooveshark.removeCurrentSongFromQueue?)
			throw new Error("Grooveshark API not available or has changed")
		Grooveshark.setSongStatusCallback(@handleGroovesharkEvent)

	findSongResource: (artist, title) ->
		url = http.constructURL("http://buddyradioproxy.appspot.com/tinysong/#{artist} #{title}")
		response = http.json(url)
		if response.SongID?
			new Model.GroovesharkSongResource(response.SongID)
		else
			null
	
	canPlay: (songResource) ->
		songResource instanceof Model.GroovesharkSongResource
			
	queuedSongIDs: []
	songResourcesWithoutLength: []
			
	play: (songResource) ->
		console.log("playing... Grooveshark songID #{songResource.songId}")
		@songResourcesWithoutLength.push(songResource)
		Grooveshark.addSongsByID([songResource.songId])
		# skip songs which are in the queue
		waitfor
			while Grooveshark.getCurrentSongStatus().song?.songID != songResource.songId
				console.log("skipping to next song to get to the current one")
				Grooveshark.next()
				hold(500)
		else
			hold(10000)
			console.warn("couldn't skip to current song in Grooveshark player")
			return
		@_playIfPaused()
		@queuedSongIDs.push(songResource.songId)
		
	enqueue: (songResource) ->
		@songResourcesWithoutLength.push(songResource)
		Grooveshark.addSongsByID([songResource.songId])
		@queuedSongIDs.push(songResource.songId)
		# FIXME if end of queue reached and there was no new song then enqueue won't play anything because it's paused
		#       maybe better handle this in StreamManager, e.g. use play() instead of enqueue() in such a case

	stop: () ->
		Grooveshark.pause()
		@queuedSongResources = []
		# useful? Grooveshark.removeCurrentSongFromQueue()
		
	_playIfPaused: () ->
		while ["paused", "none"].indexOf(Grooveshark.getCurrentSongStatus().status) != -1
			Grooveshark.play()
			hold(1000)
		
	handleGroovesharkEvent: (data) =>
		status = data.status # one of: "none", "loading", "playing", "paused", "buffering", "failed", "completed"
		song = data.song # can be null; useful: .songID, .estimateDuration, .calculatedDuration, .position
		console.debug("GS: #{status}, song id: #{song?.songID}, calculated duration: #{song?.calculatedDuration}")
		if song? and song.calculatedDuration != 0 and @songResourcesWithoutLength.some((resource) -> resource.songId == song.songID)
			resource = @songResourcesWithoutLength.filter((resource) -> resource.songId == song.songID)[0]
			resource.length = Math.round(song.calculatedDuration)
			@songResourcesWithoutLength = @songResourcesWithoutLength.filter((res) -> res != resource)
			console.log("song length set to #{resource.length} ms (songId #{song.songID})")
		if status == "completed" and @queuedSongIDs.indexOf(song.songID) != -1
			listener("streamingCompleted") for listener in @eventListeners
		
class Model.StreamingManager
	constructor: (@streamingNetworks) ->
		network.registerListener(@handleNetworkEvent) for network in @streamingNetworks
		@eventListeners = []
		
	registerListener: (listener) ->
		@eventListeners.push(listener)
	
	findAndAddSongResources: (song) ->
		resources = (network.findSongResource(song.artist, song.title) for network in @streamingNetworks)
		song.resources = resources.filter((resource) -> resource?)
		song.resources.length > 0
		
	stopRequest: false	
	
	stopStreaming: () ->
		@stopRequest = true
		listener("streamingStoppedByRequest") for listener in @eventListeners
	
	# TODO atm this would also play songs which the buddy played a few seconds and then skipped over it
	#      an alternative would be to introduce near-realtime-playing, i.e. only play pastSongs which have been scrobbled (in case of Last.fm)
	#      -> this would require some reworking of the whole structure
	startStreamingFor: (buddy) ->
		buddy.refreshListeningData(true)
		if buddy.currentSong?
			console.log("starting streaming for #{buddy.username}, informing listeners")
			listener("streamingStarted", buddy) for listener in @eventListeners
			lastSongListenedAt = -1 # time when buddy listened to last song
			lastSongListened = null # last song the buddy listened to
			lastSongStreamedResource = null # last song resource we listened to
			lastSongStreamedNetwork = null # network of last song we could actually stream
			loop
				buddy.refreshListeningData()
				if not buddy.currentSong? # TODO "and no more queued songs" -> fix when more than grooveshark integrated
					buddyInactivityTimeout = 5*60000
					songLength =
						if lastSongStreamedResource?.length?
							lastSongStreamedResource.length
						else
							5*60000
					timeout = songLength + buddyInactivityTimeout
					console.log("lastSongListenedAt: #{lastSongListenedAt} timeout: #{timeout} song length: #{songLength}")
					if (Date.now() - (lastSongListenedAt*1000)) > timeout
						console.log("buddy inactive, stopping stream (timeout = #{songLength} (song length) + #{buddyInactivityTimeout} (default buddy timeout)")
						listener("streamingStoppedBuddyNotLive", buddy) for listener in @eventListeners
						break
					else
						hold(15000)
						buddy.refreshListeningData(true)
						continue
				if @stopRequest
					@stopRequest = false
					break
				if lastSongListenedAt != buddy.currentSong.listenedAt
					console.log("different #{lastSongListenedAt} #{buddy.currentSong.listenedAt}")
					lastSongListenedAt = buddy.currentSong.listenedAt
					if @findAndAddSongResources(buddy.currentSong)
						preferredResource = @_getPreferredResource(buddy.currentSong.resources, lastSongStreamedNetwork)
						lastSongStreamedResource = preferredResource
						network = @streamingNetworks.filter((network) -> network.canPlay(preferredResource))[0]
						if lastSongStreamedNetwork == network
							network.enqueue(preferredResource)
						else
							# TODO wait here (hold) until last song in queue is over (needs to be implemented when not only Grooveshark is used!)
							network.play(preferredResource)
							lastSongStreamedNetwork = network
				# TODO if song length - current position < 30000 and end of queue, then shorter hold
				hold(30000)
		else
			console.log("streaming not started for #{buddy.username} (went offline or disabled), informing listeners")
			listener("streamingNotStarted", buddy) for listener in @eventListeners
			
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
		
	playingSong: null 
	playingPosition: null # playing position in seconds
	queuedSongResources: []   
	playedSongs: []  
	isAlternativeSong: false
	noSongFound: false
		
	handleNetworkEvent: (name, data) =>
		# todo
	
class Model.Radio
	constructor: (@buddyNetworks, @streamingNetworks) ->
		@buddyManager = new Model.BuddyManager(@buddyNetworks)
		@buddyManager.registerListener(@handleBuddyManagerEvent)
		@streamingManager = new Model.StreamingManager(@streamingNetworks)
		@streamingManager.registerListener(@handleStreamingManagerEvent)
		@eventListeners = []
	
	onAirBuddy: null
	
	tune: (buddy) ->
		if @onAirBuddy == buddy
			@tuneOut()
		else
			@tuneOut()
			@streamingManager.startStreamingFor(buddy)
	
	tuneOut: () ->
		if @onAirBuddy?
			buddy = @onAirBuddy
			@onAirBuddy = null
			@streamingManager.stopStreaming()
			listener("tunedOut", buddy) for listener in @eventListeners
		
	registerListener: (listener) ->
		@eventListeners.push(listener)
	
	handleBuddyManagerEvent: (name, data) =>
		if name == "buddyRemoved"
			if @onAirBuddy == data
				@tuneOut()
				
	handleStreamingManagerEvent: (name, data) =>
		if name == "streamingStarted"
			@onAirBuddy = data
			listener("tunedIn", @onAirBuddy) for listener in @eventListeners
		else if name == "streamingNotStarted"
			listener("tuneFailed", data) for listener in @eventListeners
		else if name == "streamingStoppedByRequest"
			@onAirBuddy = null
		else if name == "streamingStoppedBuddyNotLive"
			@onAirBuddy = null
			listener("radioStoppedNotLiveAnymore", data) for listener in @eventListeners
View = {}
	
class View.BuddySidebarSection
	constructor: (@radio, @controller) ->
		@radio.registerListener(@handleRadioEvent)
		@radio.buddyManager.registerListener(@handleBuddyManagerEvent)
		@init()
		
	handleRadioEvent: (name, data) =>
		if name == "tunedIn" or name == "tunedOut"
			@_applyStyle(data, name == "tunedIn")
		else if name == "tuneFailed"
			alert("Can't tune in. #{data.username} isn't listening songs at the moment.")
		else if name == "radioStoppedNotLiveAnymore"
			alert("#{data.username} isn't live anymore, radio will be stopped.")
			@_applyStyle(data, false)
	
	_applyStyle: (buddy, bold = true, color = null) ->
		label = $("li.sidebar_buddy[rel='#{buddy.network.className}-#{buddy.username}'] .label")
		label.css("font-weight", if bold then "bold" else "normal")
		if color?
			label.css("color", color)
			
	handleBuddyManagerEvent: (name, data) =>
		if ["buddyRemoved", "buddyAdded", "listeningDataRefreshed", "buddiesLoaded"].indexOf(name) != -1
			@refresh()
		if name == "listeningDataForcefullyRefreshed"
			@refresh() # TODO smaller update?
		# TODO listeningDataRefreshed callback per buddy (forward in buddyManager) and individual refresh
		
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
		console.log("refreshing view")
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
			if status == "LIVE"
				status += ", listening to: #{buddy.currentSong.artist} - #{buddy.currentSong.title}"
			else if status == "OFF" and buddy.pastSongs.length > 0
				status += ", last listened to: #{buddy.pastSongs[0].artist} - #{buddy.pastSongs[0].title}"
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
		console.log("view refreshed")

Controller = {}

class Controller.Radio
	constructor: (@buddyNetworks, @streamingNetworks) ->
		@radio = new Model.Radio(@buddyNetworks, @streamingNetworks)
		@view = new View.BuddySidebarSection(@radio, @)
	
	start: () ->
		@radio.buddyManager.loadLocal()
		loop
			hold(60000)
			@radio.buddyManager.refreshListeningData()
		
	addBuddy: (networkClassName, username) ->
		if networkClassName and username
			@radio.buddyManager.addBuddy(networkClassName, username)
		
	removeBuddy: (networkClassName, username) ->
		if networkClassName and username
			@radio.buddyManager.removeBuddy(@radio.buddyManager.getBuddy(networkClassName, username))
		
	tune: (networkClassName, username) ->
		if networkClassName and username
			@radio.tune(@radio.buddyManager.getBuddy(networkClassName, username))
		
# END
	
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

