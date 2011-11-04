# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

exports.start = () ->
	controller = new Controller.Radio([new Model.LastFmBuddyNetwork], [new Model.GroovesharkStreamingNetwork])
	new View.Grooveshark(controller)
	controller.start()
	
exports.classes = () ->
	{ Model, View, Controller }

http = require("apollo:http")
LastFmApi = require("apollo:lastfm")
LastFmApi.key = "53cda3b9d8760dbded7b4ca420b5abb2"

EOVR = new Error("must be overriden")