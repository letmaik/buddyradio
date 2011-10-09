cd src
$main = @()
$files =
	"Main",
	"Model\Model",
	"Model\APIRateLimiter",
	"Model\Buddy",
	"Model\BuddyManager",
	"Model\BuddyNetwork",
	"Model\Radio",
	"Model\Song",
	"Model\SongFeed",
	"Model\SongFeedStream",
	"Model\StreamingNetwork",
	"Model\Grooveshark",
	"Model\LastFm",
	"View\View",
	"Controller\Controller"
foreach ($file in $files) {
    $main += Get-Content ($file + ".coffee")
}
$main = [string]::join([environment]::newline, $main)
cd ..
$tmpl = Get-Content "greasemonkey_debug.tmpl.js"
$tmpl = $tmpl -replace "#COFFEE#", $main 
$tmpl | Out-File "greasemonkey_debug.user.js" -Encoding ASCII

# uses special coffee version from https://github.com/onilabs/coffee-script
$main | coffee -sc | Out-File "dist\buddyradio.sjs" -Encoding ASCII

# minify obviously won't work yet as sjs is non-standard js
# probably not required either (~50kb .sjs gets gzipped to ~9kb)