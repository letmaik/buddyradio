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
s.addEventListener("load", loadBuddyRadioModuleOnDelay, false);
document.body.appendChild(s);

function loadBuddyRadioModuleOnDelay() {
	setTimeout(loadBuddyRadioModule, 666);
}

function loadBuddyRadioModule() {
	unsafeWindow.require("github:neothemachine/buddyradio/master/buddyradio", {callback: loadBuddyRadio});
}

function loadBuddyRadio(err, module) {
	if (err) throw ('error: ' + err);
	module.start(unsafeWindow, unsafeDocument);
}