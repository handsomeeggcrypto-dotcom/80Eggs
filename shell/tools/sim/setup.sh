#!/bin/bash
# Builds a Rockbox UI simulator for SHELL (iPod Classic 6G) plus the skin checker.
#   tools/sim/setup.sh      (needs: brew install sdl2 gcc)
# Everything lands in tools/sim/build/ (git-ignored). Takes a few minutes.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
B="$HERE/build"
mkdir -p "$B"
cd "$B"

[ -d rb ] || git clone --depth 1 -q https://github.com/Rockbox/rockbox.git rb

# macOS: point configure at Homebrew's gcc (it hardcodes one version)
V=$(ls /opt/homebrew/bin | grep -E '^gcc-[0-9]+$' | sed 's/gcc-//' | sort -n | tail -1)
sed -i '' -E "s/gcc-[0-9]+$/gcc-$V/; s/gcc-ar-[0-9]+$/gcc-ar-$V/; s/cpp-[0-9]+$/cpp-$V/" rb/tools/configure

# scripted buttons + screenshots: the simulator reads commands from $SIMCMD
python3 "$HERE/patch_buttons.py" rb/firmware/target/hosted/sdl/button-sdl.c

if [ ! -x sim/rockboxui ]; then
  mkdir -p sim && cd sim
  ../rb/tools/configure --target=ipod6g --type=s > /dev/null
  make -j8 > build.log 2>&1
  make fullinstall >> build.log 2>&1
  cd ..
fi
if [ ! -x cw/checkwps.ipod6g ]; then
  mkdir -p cw && cd cw
  ../rb/tools/configure --target=ipod6g --type=C > /dev/null 2>&1
  make -j8 > build.log 2>&1
  cd ..
fi
echo "simulator: $B/sim/rockboxui"
echo "skin checker: $B/cw/checkwps.ipod6g"
