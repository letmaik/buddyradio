cd src
$main = @()
$files =
	"Main",
	"Model\Model",
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