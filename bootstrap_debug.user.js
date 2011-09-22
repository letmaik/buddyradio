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
	
class Model.SongRessource
	constructor: () ->
		@length = null # song length in seconds | null if unknown (yet)
	
class Model.GroovesharkSongRessource extends Model.SongRessource
	constructor: (@songId) ->
		
class Model.Song
	constructor: (@artist, @title, @listenedAt) -> # unix timestamp | null if current song
		@ressources = null # null = not searched yet; [] = no ressources found
	
class Model.Buddy
	constructor: (@network, @username, @avatarUrl, @profileUrl) ->
		@listeningStatus = "off" # live | off | disabled
		@currentSong = null
		@pastSongs = []
	
	refreshListeningData: () ->
		data = @network.loadListeningData(@username)
		@listeningStatus = data.listeningStatus
		@currentSong = data.currentSong
		@pastSongs = data.pastSongs

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
		buddy = new Model.Buddy(this, user.name, user.image[0]["#text"], user.url)
		buddy.refreshListeningData()
		buddy
	
	loadListeningData: (username) ->
		console.log("getting recent tracks from lastfm")
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
			@buddies.push(buddy)
			@saveLocal()
			console.log("user #{username} added")
		else
			console.log("user #{username} not found")
			
	removeBuddy: (buddyToBeRemoved) ->
		@buddies = @buddies.filter((buddy) -> buddy != buddyToBeRemoved)
		@saveLocal()
		listener("Model.BuddyManager:BuddyRemoved", buddyToBeRemoved) for listener in @eventListeners
			
	refreshListeningData: () ->
		buddy.refreshListeningData() for buddy in @buddies
		
	saveLocal: () -> 
		reducedBuddies = ([buddy.network.className, buddy.username] for buddy in @buddies)
		localStorage[@storageKey] = JSON.stringify(reducedBuddies)
		
	loadLocal: () ->
		reducedBuddies = JSON.parse(localStorage[@storageKey] or "[]")
		@buddies = (@_findBuddyNetwork(reducedBuddy[0]).loadBuddy(reducedBuddy[1]) for reducedBuddy in reducedBuddies)
	
	registerListener: (listener) ->
		@eventListeners.push(listener)
		
	_findBuddyNetwork: (networkClassName) ->
		@buddyNetworks.filter((network) -> network.className == networkClassName)[0]

class Model.StreamingNetwork
	constructor: () ->
		@eventListeners = []
		
	registerListener: (listener) ->
		@eventListeners.push(listener)
		
	findSongRessource: (artist, title) -> throw new Error("must be overriden")
	canPlay: (songRessource) -> throw new Error("must be overriden") # true if this network can handle the specific ressource
	play: (songRessource) -> throw new Error("must be overriden")
	stop: () -> throw new Error("must be overriden")
	# declare "enqueue: (songRessource) ->" in subclass if network supports enqueueing
		
class Model.GroovesharkStreamingNetwork extends Model.StreamingNetwork
	constructor: () ->
		super()
		if not (Grooveshark.addSongsByID? and Grooveshark.setSongStatusCallback? and Grooveshark.pause? and Grooveshark.removeCurrentSongFromQueue?)
			throw new Error("Grooveshark API not available or has changed")
		Grooveshark.setSongStatusCallback(@.handleGroovesharkEvent)

	findSongRessource: (artist, title) ->
		url = http.constructURL("http://buddyradioproxy.appspot.com/tinysong/#{artist} #{title}")
		response = http.json(url)
		if response.SongID?
			new Model.GroovesharkSongRessource(response.SongID)
		else
			null
	
	canPlay: (songRessource) ->
		songRessource instanceof Model.GroovesharkSongRessource
			
	queuedSongIDs: []
			
	play: (songRessource) ->
		console.log("playing... Grooveshark songID #{songRessource.songId}")
		Grooveshark.addSongsByID([songRessource.songId])
		hold(5000) # TODO do via callback
		# skip songs which are in the queue 
		# FIXME not reliable, goes into infinite loop very often
		#while Grooveshark.getCurrentSongStatus().song.songID != songRessource.songId
		#	Grooveshark.next()
		if Grooveshark.getCurrentSongStatus().status == "paused" or Grooveshark.getCurrentSongStatus().status == "none" 
			Grooveshark.play()
		@queuedSongIDs.push(songRessource.songId)
		
	enqueue: (songRessource) ->
		Grooveshark.addSongsByID([songRessource.songId])
		if Grooveshark.getCurrentSongStatus().status == "paused" or Grooveshark.getCurrentSongStatus().status == "none" 
			Grooveshark.play()
		@queuedSongIDs.push(songRessource.songId)

	stop: () ->
		Grooveshark.pause()
		@queuedSongRessources = []
		# useful? Grooveshark.removeCurrentSongFromQueue()
		
	handleGroovesharkEvent: (data) ->
		status = data.status # one of: "none", "loading", "playing", "paused", "buffering", "failed", "completed"
		song = data.song # can be null; useful: .songID, .estimateDuration, .calculatedDuration, .position
		if status == "completed" and @queuedSongIDs.indexOf(song.songID) != -1
			@eventListeners("Model.StreamingNetwork:StreamingCompleted")
		
class Model.StreamingManager
	constructor: (@streamingNetworks) ->
		network.registerListener(@.handleEvent) for network in @streamingNetworks
	
	findAndAddSongRessources: (song) ->
		ressources = (network.findSongRessource(song.artist, song.title) for network in @streamingNetworks)
		song.ressources = ressources.filter((ressource) -> ressource?)
		song.ressources.length > 0
		
	stopStreaming: () ->
		network.stop() for network in @streamingNetworks
		
	startStreamingFor: (buddy) ->
		buddy.refreshListeningData()
		if buddy.currentSong? and @findAndAddSongRessources(buddy.currentSong)
			console.log("starting streaming for #{buddy.username}")
			firstRessource = buddy.currentSong.ressources[0]
			network = @streamingNetworks.filter((network) -> network.canPlay(firstRessource))[0]
			network.play(firstRessource)
			# todo
		
		
	playingSong: null 
	playingPosition: null # playing position in seconds
	queuedSongs: []   
	playedSongs: []  
	isAlternativeSong: false
	noSongFound: false
		
	handleEvent: (name, data) ->
		# todo
	
class Model.Radio
	constructor: (@buddyNetworks, @streamingNetworks) ->	
		@buddyManager = new Model.BuddyManager(@buddyNetworks)
		@buddyManager.registerListener(@.handleEvent)
		@streamingManager = new Model.StreamingManager(@streamingNetworks)
	
	onAirBuddy: null
	
	tune: (buddy) ->
		@tuneOut()
		if @streamingManager.startStreamingFor(buddy)
			@onAirBuddy = buddy
	
	tuneOut: () ->
		@onAirBuddy = null
		@streamingManager.stopStreaming()
	
	handleEvent: (name, data) ->
		if name == "Model.BuddyManager:BuddyRemoved"
			if @onAirBuddy == data
				@tuneOut()

View = {}
	
class View.BuddySidebarSection
	constructor: (@radio, @controller) ->
	
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
		position = newButton.offset()
		newButton.click( () =>
			if $("#buddyradio_newuserform").length == 1
				$("#buddyradio_newuserform").remove()
				return

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
				@controller.addLastFmBuddy($("#buddyradio_newuser")[0].value)
				$("#buddyradio_newuserform").remove()
			)
			$("#buddyradio_newuser").keydown((event) =>
				if event.which == 13
					@controller.addLastFmBuddy($("#buddyradio_newuser")[0].value)
					$("#buddyradio_newuserform").remove()
			)
		)
	refresh: () ->
		console.log("refreshing view")
		$("#sidebar_buddyradio").empty()
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
		) for buddy in @radio.buddyManager.buddies
		$("li.sidebar_buddy .remove").click((event) =>
			event.preventDefault()
			entry = $(event.currentTarget).parent().parent()
			[networkClassName, username] = entry.attr("rel").split("-")
			@controller.removeBuddy(networkClassName, username)
		)
		$("li.sidebar_buddy .label").click((event) =>
			event.preventDefault()
			entry = $(event.currentTarget).parent().parent()
			[networkClassName, username] = entry.attr("rel").split("-")
			@controller.tune(networkClassName, username)
		)
		console.log("view refreshed")

Controller = {}

class Controller.Radio
	constructor: (@buddyNetworks, @streamingNetworks) ->
		@radio = new Model.Radio(@buddyNetworks, @streamingNetworks)
		@view = new View.BuddySidebarSection(@radio, @)
	
	start: () ->
		@view.init()
		@radio.buddyManager.loadLocal()
		@view.refresh()
		loop
			hold(30000)
			@radio.buddyManager.refreshListeningData()
			@view.refresh()
		
	addLastFmBuddy: (username) ->
		@radio.buddyManager.addBuddy("Model.LastFmBuddyNetwork", username)
		@view.refresh()
		
	removeBuddy: (networkClassName, username) ->
		@radio.buddyManager.removeBuddy(@radio.buddyManager.getBuddy(networkClassName, username))
		@view.refresh()
		
	tune: (networkClassName, username) ->
		@radio.tune(@radio.buddyManager.getBuddy(networkClassName, username))
		@view.refresh()
		
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

