// ==UserScript==
// @name          BuddyRadio
// @namespace     http://github.com/neothemachine/
// @version       0.2
// @description   tbd
// @include       http://grooveshark.com/*
// ==/UserScript==


if (window.top != window.self)  // don't run on iframes
    return;
	
// TODO only execute if Grooveshark object available (takes some time!)
// (or prevent it from running on http://grooveshark.com/upload etc.)

var s = document.createElement("script");
s.type = "text/javascript";
s.src = "http://code.onilabs.com/apollo/0.13/oni-apollo.js";
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
#COFFEE#
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

