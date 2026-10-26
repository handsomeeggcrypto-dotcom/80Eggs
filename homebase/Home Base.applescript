-- Source for the "Home Base" app on the Desktop. Rebuild with:
--   osacompile -o ~/Desktop/"Home Base.app" homebase/"Home Base.applescript"
-- then copy homebase/icon.icns over Contents/Resources/applet.icns.
-- Opens 80Eggs Home Base, starting its server in the background if it isn't running yet.
on serverUp()
	return (do shell script "nc -z 127.0.0.1 8090 >/dev/null 2>&1 && echo yes || echo no") is "yes"
end serverUp

if not serverUp() then
	do shell script "/usr/bin/python3 ~/80Eggs/homebase/server.py --detach"
	repeat 30 times
		if serverUp() then exit repeat
		delay 0.1
	end repeat
end if
open location "http://localhost:8090"
