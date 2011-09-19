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
# not sure if jquery-binding needed at all
# require("apollo:jquery-binding").install()
	
Model = {}
	
class Model.SongRessource
	play: -> throw new Error("must be overriden")
	length: null    # song length in seconds | null if unknown (yet)
	
class Model.GroovesharkSongRessource extends Model.SongRessource
	constructor: (@songId) ->
	play: () -> 
		Grooveshark.addSongsByID([@songID])
		
class Model.Song
	constructor: (@artist, @title, @listenedAt) -> # unix timestamp | null if current song
	ressources: null # null = not searched yet; [] = no ressources found
	
class Model.Buddy
	constructor: (@network, @username, @avatarUrl, @profileUrl) ->
	
	listeningStatus: "off" # live | off | disabled
	currentSong: null
	pastSongs: []
	
	refreshListeningData: ->
		data = @network.loadListeningData(@username)
		@listeningStatus = data.listeningStatus
		@currentSong = data.currentSong
		@pastSongs = data.pastSongs

class Model.BuddyNetwork
	name: "Network Name" # used in links etc.
	loadBuddy: (buddyId) -> throw new Error("must be overriden")
	loadListeningData: (buddyId) -> throw new Error("must be overriden")
	
class Model.LastFmBuddyNetwork extends Model.BuddyNetwork
	name: "Last.fm"
	className: "Model.LastFmBuddyNetwork"
	
	loadBuddy: (username) ->
		user = LastFmApi.get({ method: "user.getInfo", user: username}).user
		buddy = new Model.Buddy(this, user.name, user.image[0]["#text"], user.url)
		buddy.refreshListeningData()
		buddy
	
	loadListeningData: (username) ->
		response = LastFmApi.get({method: "user.getRecentTracks", user: username})
		if response.error?
			{listeningStatus: "disabled", currentSong: null, pastSongs: []}
		else
			tracks = response.track
			currentSong = 
				new Model.Song(
					track.artist["#text"],
					track.name
				) for track in tracks when track["@attr"]?.nowplaying	
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
	
	refreshListeningData: () ->
		buddy.refreshListeningData() for buddy in @buddies
		
	saveLocal: () -> 
		reducedBuddies = ([buddy.network.classname, buddy.username] for buddy in @buddies)
		localStorage[@storageKey] = JSON.stringify(reducedBuddies)
		
	loadLocal: () ->
		reducedBuddies = localStorage[@storageKey] or []
		@buddies = _findBuddyNetwork(reducedBuddy[0]).loadBuddy(reducedBuddy[1]) for reducedBuddy in reducedBuddies
		
	_findBuddyNetwork: (networkClassName) ->
		network for network in @buddyNetworks when network.className == networkClassName

class Model.StreamingNetwork
	findSongRessource: (artist, title) -> throw new Error("must be overriden")
		
class Model.GroovesharkStreamingNetwork extends Model.StreamingNetwork
	findSongRessource: (artist, title) ->
		url = http.constructURL("http://tinysong.com/b/#{artist} #{title}", {format: "json", key: "92565fa4e23f6500b0616a9df0894a6b"})
		response = http.json(url)
		if response.SongID?
			new Model.GroovesharkSongRessource(response.SongID)
		else
			null
		
class Model.StreamingManager
	constructor: (@streamingNetworks) ->
	
	findAndAddSongRessources: (song) ->
		ressources = (network.findSongRessource(song.artist, song.title) for network in @streamingNetworks)
		song.ressources = (ressource for ressource in ressources when ressource?)
		song.ressources.length > 0
	
class Model.Radio
	constructor: (@buddyNetworks, @streamingNetworks) ->
	
	buddyManager: new Model.BuddyManager(@buddyNetworks)
	streamingManager: new Model.StreamingManager(@streamingNetworks)
	onairBuddy: null	
	playingSong: null 
	playingPosition: null # playing position in seconds
	queuedSongs: []   
	playedSongs: []  
	isAlternativeSong: false
	noSongFound: false

View = {}
	
class View.BuddySidebarSection
	constructor: (@radio) ->
	
	init: () ->
		$("#sidebar .container_inner").append("""
		<div id="sidebar_buddyradio_wrapper" class="listWrapper">
            <div class="divider" style="display: block;">
                <span class="sidebarHeading">Buddy Radio</span>
                <a class="sidebarNew"><span>Add Buddy</span></a>
            </div>
            <ul id="sidebar_buddyradio" class="link_group">
				<li title="Test" rel="122" class="sidebar_buddy buddy sidebar_link"> 
					<a href="">
						<span class="icon remove"></span>
						<span class="icon"></span>
						<span class="label ellipsis">Test</span>
					</a>
				</li>
			</ul>
        </div>
		""")
	refresh: () ->
		# do a complete refresh based on model data

Controller = {}

class Controller.Radio
	constructor: (@buddyNetworks, @streamingNetworks) ->
	radio: new Model.Radio(@buddyNetworks, @streamingNetworks)
	view: new View.BuddySidebarSection(@radio)
	
	start: () ->
		@view.init() # loading buddies...
		@radio.buddyManager.loadLocal()
		@view.refresh()
		# start routine....
		
		#sidebar.container div.container_inner_wrapper div.container_inner

	
# END
	
	]]></>).toString();
	
	unsafeWindow.CScript = module.CoffeeScript;
	unsafeWindow.CS = debugMultiLineHack;
	var sjsSrc = module.CoffeeScript.compile(debugMultiLineHack);
	unsafeWindow.require("local:buddyradio", {callback: radioLoaded, src: sjsSrc});
}

function radioLoaded(err, module) {
	if (err) alert(err); //throw new Error('error: ' + err);
	module.start();
}

