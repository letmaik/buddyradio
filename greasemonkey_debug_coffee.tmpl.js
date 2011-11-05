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
	s.addEventListener("load", loadCoffeeOnDelay, false);
	document.body.appendChild(s);

	function loadCoffeeOnDelay() {
		setTimeout(loadCoffee, 666);
	}

	function loadCoffee() {
		window.require("github:onilabs/coffee-script/master/extras/coffee-script.js", {callback: coffeeLoaded});
	}

	function coffeeLoaded(err, module) {
		if (err) throw ('error: ' + err);
		
		var debugMultiLineHack = (<><![CDATA[
	#COFFEE#
		]]></>).toString();
		
		window.CScript = module.CoffeeScript;
		window.CS = debugMultiLineHack;
		var sjsSrc = module.CoffeeScript.compile(debugMultiLineHack);
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