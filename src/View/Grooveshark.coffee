# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

class View.Grooveshark
	constructor: (controller) ->
		if $("#header_mainNavigation").length == 1
			new View.GroovesharkV2(controller)
		else if $("#sidebar .container_inner").length == 1
			new View.GroovesharkV1(controller)
		else
			throw new Error("Couldn't detect version of Grooveshark")