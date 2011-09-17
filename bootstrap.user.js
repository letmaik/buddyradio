var s = document.createElement("script");
s.type = "text/javascript";
s.src = "http://code.onilabs.com/apollo/0.12/oni-apollo.js";
s.onload(loadBuddyRadio);
document.body.appendChild(s);

function loadBuddyRadio() {
	var br = require("github:neothemachine/buddyradio/master/buddyradio");
	br.start();
}