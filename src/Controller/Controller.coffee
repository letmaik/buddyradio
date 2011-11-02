# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

Controller = {}

class Controller.Radio
	constructor: (@buddyNetworks, @streamingNetworks) ->
		@radio = new Model.Radio(@buddyNetworks, @streamingNetworks)
	
	start: () ->
		@radio.buddyManager.loadLocal()
		
	addBuddy: (networkClassName, username) ->
		if networkClassName and username
			@radio.buddyManager.addBuddy(networkClassName, username)
		
	removeBuddy: (networkClassName, username) ->
		if networkClassName and username
			@radio.buddyManager.removeBuddy(@radio.buddyManager.getBuddy(networkClassName, username))
			
	getBuddy: (networkClassName, username) ->
		if networkClassName and username
			@radio.buddyManager.getBuddy(networkClassName, username)
			
	importBuddies: (networkClassName, username) ->
		if networkClassName and username
			@radio.buddyManager.importBuddies(networkClassName, username)
		
	tune: (networkClassName, username) ->
		if networkClassName and username
			@radio.tune(@radio.buddyManager.getBuddy(networkClassName, username))
	
	tuneHistoric: (networkClassName, username, from, to) ->
		if networkClassName and username and from instanceof Date and to instanceof Date
			@radio.tune(@radio.buddyManager.getBuddy(networkClassName, username), from, to)
			
	setSongsPerFeedInARow: (count) ->
		if count? and count > 0
			@radio.setSongsPerFeedInARow(count)
	
	setPreloadCount: (count) ->
		if count? and count >= 0
			@radio.setPreloadCount(count)