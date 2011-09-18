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
	alert("a")

Model = {}
	
class Model.SongRessource
	play: -> throw new Error("must be overriden")
	
class Model.GroovesharkSongRessource extends Model.SongRessource
	constructor(@songId) ->
	play: -> # todo
		
class Model.Song
	constructor(@artist, @title, @listenedAt) -> # unix timestamp
	length: null    # song length in seconds
	ressources: []	
	
class Model.Buddy
	constructor: (@username, @listeningStatus) ->
	
	currentSong: null
	pastSongs: []    
	
	refreshListeningData: -> throw new Error("must be overriden")

class Model.LastFmBuddy extends Model.Buddy
	refreshListeningData: ->
		listeningStatus = "live"
		#currentSong = 
		#pastSongs..
	
	
class Model.BuddyRessource
	name: "Buddy Ressource Name" # used in links etc.
	loadBuddy: (buddyId) -> throw new Error("must be overriden")
	
class Model.LastFmBuddyRessource extends Model.BuddyRessource
	name: "Last.fm"
	loadBuddy: (username) ->
		# do stuff & return LastFmBuddy object
		
class Model.BuddyManager
	buddies: []
	refreshListeningData: () ->
		buddy.refreshListeningData() for buddy in buddies
		null
	
class Model.Radio
	constructor: (@buddyRessources) ->
	
	buddyManager: new Model.BuddyManager
	onairBuddy: null  
	playingSong: null 
	playingPosition: null # playing position in seconds
	queuedSongs: []   
	playedSongs: []  
	isAlternativeSong: false
	noSongFound: false
	
	
# END
	
	]]></>).toString();
	
	unsafeWindow.CScript = module.CoffeeScript;
	unsafeWindow.CS = debugMultiLineHack;
	var sjsSrc = module.CoffeeScript.compile(debugMultiLineHack);
	unsafeWindow.require("local:buddyradio", {callback: radioLoaded, src: sjsSrc});
}

function radioLoaded(err, module) {
	if (err) throw ('error: ' + err);
	module.start();
}

