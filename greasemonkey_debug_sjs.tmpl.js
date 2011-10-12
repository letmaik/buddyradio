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
s.addEventListener("load", loadRadioOnDelay, false);
document.body.appendChild(s);

function loadRadioOnDelay() {
	setTimeout(loadRadio, 666);
}

function loadRadio() {	
	var debugMultiLineHack = (<><![CDATA[
#SJS#
	]]></>).toString();
	
	var sjsSrc = debugMultiLineHack;
	unsafeWindow.SJS = sjsSrc;
	unsafeWindow.require("local:buddyradio", {callback: radioLoaded, src: sjsSrc});
}

function radioLoaded(err, module) {
	if (err) alert(err); //throw new Error('error: ' + err);
	module.start();
}

