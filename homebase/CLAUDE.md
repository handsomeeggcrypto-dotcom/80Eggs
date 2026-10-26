# Home Base (`homebase/`)

A local dashboard of every 80Eggs project: status, last commit, uncommitted files, how far the live site is behind, Play / Start / Stop / Folder buttons.

- Open it with `~/Desktop/Home Base.app` (built from `Home Base.applescript` + `icon.icns`; rebuild steps are at the top of the .applescript). The app runs `server.py --detach`, because a plain `&` inside AppleScript's `do shell script` hangs the app.
- Or `python3 homebase/server.py` → http://localhost:8090, or the `homebase` preview config.
- **Adding a project = one entry in `PROJECTS` in `server.py`.** `status` is `live` (linked from the homepage), `hidden` (deployed, not linked) or `local` (this Mac only). Add a `server` entry for projects that need their own server, or `mount` for a drive.
- The page only works with the server. On the live site it shows "server isn't answering", which is fine.

## Safety rules (keep them)

- Listens on `127.0.0.1` only.
- It can only start/stop the commands in `PROJECTS`. Requests come in as project ids, never commands or paths.
- POSTs need an `X-Homebase: 1` header so other websites can't trigger them.
- `/site/` serves the repo read-only but blocks dotfiles and the `PRIVATE` folders (`yolk`, `shell`, `jack`, `homebase`, `ipod_photos`).
- git is read with `--no-optional-locks`. Without it, the 5-second polling grabs `index.lock` and makes commits fail.

Restart the server after editing `server.py` (`pkill -f homebase/server.py`, then open the app).
