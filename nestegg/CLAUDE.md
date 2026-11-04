# Nest Egg (`nestegg/`)

Practice crypto bots, each with a pretend $1,000, so the user can see which rules actually make money before risking any. The user wants **small steady profits that compound**, not moonshots.

- **Memecoin hunt** (`memes.py`, what the user cares about most): two bots trade trending Solana memecoins. **Safe Scout** runs every rug check, and **No-Rules Randy** buys anything trending up as the control. Same exits for both: take half at +25%, 15% trailing stop after that, −20% stop loss, 4-hour max hold, and run if liquidity drops 40%.
- **SOL bots** (`bots.py`): six bots trading SOL against dollars, with a 3-year backtest.

**It has no wallet and cannot trade.** Keep it that way unless the user explicitly asks for a real-money version, and even then Claude never moves money or places trades: the user funds a separate small wallet and switches it on themselves. Keys would go in `data/` (gitignored), never in code. The repo is public.

## Run

- `python3 nestegg/server.py` → http://localhost:8121 (this Mac only), or Home Base → Start, or the `nestegg` preview config.
- **It runs all the time as a LaunchAgent** (`com.80eggs.nestegg`, KeepAlive), so it restarts after a reboot or a crash. `python3 nestegg/server.py --install` / `--uninstall`. Restart it with `launchctl kickstart -k gui/$(id -u)/com.80eggs.nestegg`. Log: `data/server.log`.
- SOL bots: every minute it pulls Coinbase's hourly SOL-USD candles (free, no key), feeds each finished hour to the bots, and re-runs the backtest once a day.
- Memecoins: every 30 s it checks open positions, and every 2 min it scans Jupiter's trending lists. Every fill is a real Jupiter quote for that size, plus 1% extra slippage and a $0.20 fee. Jupiter's free `lite-api` allows about 1 call a second, and `memes.get()` spaces calls to fit. RugCheck (`api.rugcheck.xyz`) is free too.
- `python3 nestegg/memes.py` runs one scan in the terminal, but it writes to the real `data/memes.json`, so stop the service first.
- `python3 nestegg/engine.py backtest` prints the 3-year table in the terminal.
- **Restart the server after changing `bots.py` or `engine.py`.**

## Files

| File | What |
| --- | --- |
| `bots.py` | the bots. Each `decide(m, w)` returns how many SOL it wants to hold (or `None`). State goes in `w["state"]`. Add a bot by adding a class to `BOTS` and a colour to `COLORS` in `index.html` |
| `engine.py` | prices, fake wallets, fees (0.1%/trade), idle-dollar interest (4%/yr), backtest, live paper trading |
| `memes.py` | the memecoin bots: trending feed, the rug checks (`momentum`, `safety`, `rugcheck`, `test_sell`), paper buys and sells at Jupiter quotes, the exit rules (`watch`) |
| `server.py` | runs both loops, serves `index.html` and `/api/data` |
| `data/` | gitignored: `candles.json` (price history), `paper.json` (the live race; delete it to restart the race), `backtest.json`, `memes.json` (the memecoin race; delete it to restart), `server.log` |

## Ideas the user has asked about

- **Grok / X sentiment**: people pair bots with Grok to read what X is saying about a coin. That needs a paid xAI API key, and money is tight. It could be added as one more Scout check later, judged by whether it beats Scout without it.

## Rules for changing bots

- Use rules with a real track record elsewhere, at their standard settings. **Don't tune numbers until the backtest looks good**: that just memorises SOL's past and falls apart live.
- Judge bots on worst drop and months up, not only on the final number. `Savings` and `Just Hold` are the yardsticks.
- Be honest with the user about results, including when nothing beats Savings.
