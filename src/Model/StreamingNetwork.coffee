# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

class Model.StreamingNetwork
	constructor: () ->
		@eventListeners = []
		
	registerListener: (listener) ->
		@eventListeners.push(listener)
		
	removeListener: (listenerToBeRemoved) ->
		@eventListeners = @eventListeners.filter((listener) -> listener != listenerToBeRemoved)
		
	findSongResource: (artist, title) -> throw new Error("must be overriden")
	canPlay: (songResource) -> throw new Error("must be overriden") # true if this network can handle the specific resource
	play: (songResource) -> throw new Error("must be overriden")
	stop: () -> throw new Error("must be overriden")
	# declare "enqueue: (songResource) ->" in subclass if network supports enqueueing