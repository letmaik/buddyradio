// ==UserScript==
// @name          BuddyRadio Debug
// @namespace     http://github.com/neothemachine/
// @include       http://grooveshark.com/*
// @include       http://preview.grooveshark.com/*
// ==/UserScript==

var loader = function () {
	if (window.top != window.self)  // don't run on iframes
		return;
		
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
		window.SJS = sjsSrc;
		window.require("local:buddyradio", {callback: radioLoaded, src: sjsSrc});
	}

	function radioLoaded(err, module) {
		if (err) alert(err); //throw new Error('error: ' + err);
		module.start();
	}
};

var script = document.createElement('script');
script.textContent = '(' + loader + ')();';
document.body.appendChild(script);