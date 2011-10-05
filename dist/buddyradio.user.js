// ==UserScript==
// @name          BuddyRadio
// @namespace     http://github.com/neothemachine/
// @version       0.1
// @description   tbd
// @include       http://grooveshark.com/*
// ==/UserScript==

if (window.top != window.self)  // don't run on iframes
    return;

var s = document.createElement("script");
s.type = "text/javascript";
s.src = "http://code.onilabs.com/apollo/0.13/oni-apollo.js";
s.addEventListener("load", loadBuddyRadioModuleOnDelay, false);
document.body.appendChild(s);

function loadBuddyRadioModuleOnDelay() {
	setTimeout(loadBuddyRadioModule, 666);
}

function loadBuddyRadioModule() {
	unsafeWindow.require("github:neothemachine/buddyradio/master/dist/buddyradio", {callback: loadBuddyRadio});
}

function loadBuddyRadio(err, module) {
	if (err) throw ('error: ' + err);
	module.start();
}