#!/bin/bash
# Runs a scripted session in the simulator and saves the screenshots as one sheet.
#   tools/sim/run.sh "<commands separated by ;>" <screenshots expected> <out.png> [columns]
# Copies shell/root onto the simulator's disk first. See patch_buttons.py for commands.
HERE="$(cd "$(dirname "$0")" && pwd)"
SIM="$HERE/build/sim"; D="$SIM/simdisk"
pkill -9 rockboxui; sleep 1
rsync -a "$HERE/../../root/" "$D/"
[ -f "$D/.rockbox/config.cfg" ] || { cp "$HERE/../../root/.rockbox/themes/yolk.cfg" "$D/.rockbox/config.cfg"; echo 'start in screen: root' >> "$D/.rockbox/config.cfg"; }
rm -f "$D"/dump*.bmp "$D/.rockbox/.resume.cfg"* "$D/.rockbox/.playlist_control"
cd "$SIM"; : > cmds.txt
(SIMCMD="$SIM/cmds.txt" ./rockboxui --nobackground > sim.log 2>&1 &)
echo "$1" | tr ';' '\n' >> cmds.txt
F="$SIM/frames"; mkdir -p "$F"; rm -f "$F"/*; n=0
for i in $(seq 1 480); do
  for f in "$D"/dump*.bmp; do [ -e "$f" ] || continue; sleep 0.2; n=$((n+1)); mv "$f" "$(printf "$F/f%03d.bmp" $n)"; done
  [ $n -ge "$2" ] && break; sleep 0.25
done
python3 - "$F" "$3" "${4:-3}" <<'PY'
import sys, glob
from PIL import Image
fs = sorted(glob.glob(sys.argv[1] + "/f*.bmp")); cols = int(sys.argv[3])
rows = max(1, (len(fs) + cols - 1) // cols)
c = Image.new("RGB", (330 * cols, 250 * rows), (60, 60, 60))
for i, f in enumerate(fs):
    c.paste(Image.open(f), ((i % cols) * 330, (i // cols) * 250))
c.save(sys.argv[2]); print(len(fs), "frames")
PY
