// ==UserScript==
// @name          BuddyRadio Debug
// @namespace     http://github.com/neothemachine/
// @include       http://grooveshark.com/*
// ==/UserScript==

(function ()
{
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
})();