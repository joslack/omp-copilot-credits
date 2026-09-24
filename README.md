# omp-copilot-credits

An [oh-my-pi](https://github.com/can1357/oh-my-pi) plugin that shows how much of your GitHub Copilot
AI-credit allowance is left, how fast you're burning it, and how long it will last — right in the
status line.

```
 112,660/125,000 · 420/h · 561/d · ~201d · ↻ Oct 1
```

| Part | Meaning |
|---|---|
|  / /  | Copilot icon; switches to warning when you'd run out up to 3 days before the reset, error when earlier |
| `112,660/125,000` | Credits remaining / monthly entitlement |
| `420/h` | Credits spent in the last hour, **across all your agents** |
| `561/d` | Average credits per day since the last reset |
| `~201d` | Linear estimate of days until the credits run out (remaining ÷ daily average) |
| `↻ Oct 1` | Next quota reset |

## How it works

- Numbers come from GitHub, not from your session: every Copilot response carries
  `x-quota-snapshot-*` headers with account-wide quota, and on startup the plugin reads
  `copilot_internal/user` (free — it consumes no quota) if nothing recent is cached.
- Every OMP process writes what it sees to one shared file
  (`~/.omp/agent/copilot-credits.json`), so concurrent agents share one view and one burn-rate
  history. No background polling of GitHub; the plugin only re-reads that local file every 30 s.
- Shown only while the active model is a `github-copilot` model.

## Install

```sh
omp plugin install github:joslack/omp-copilot-credits
```

Requires a Nerd Font for the icons; without one (OMP's non-nerd symbol preset) it shows `Copilot`.

## Commands

- `/copilot-credits` — refresh from GitHub now and print the current line.

## Configuration

Pick what the line shows from OMP's plugin settings screen, or from the CLI:

```sh
omp plugin config set omp-copilot-credits showReset true
omp plugin config list omp-copilot-credits
```

| Setting | Default | Effect |
|---|---|---|
| `showRemaining` | `true` | `112,660/125,000` |
| `showHourly` | `true` | `420/h` — last hour, all agents |
| `showDaily` | `true` | `561/d` — average since reset |
| `showRunway` | `true` | `~201d` — estimated days left |
| `showReset` | `false` | `↻ Oct 1` — Copilot resets on the 1st, so off by default |
| `numberStyle` | `exact` | `exact` → `112,660/125,000`, `compact` → `112.7k/125k` |
| `visibility` | `copilot` | `copilot`: only while a Copilot model is active · `always`: whenever quota data exists |
| `bucket` | `auto` | `premium_interactions` or `chat`; auto uses premium interactions when your plan has them, else chat (Copilot Free). Env: `COPILOT_CREDITS_BUCKET` |

The icon always shows, so pace stays visible even with every field turned off. Changes apply
within 30 s, no restart needed. `COPILOT_CREDITS_STORE` overrides the shared file location.

## Development

```sh
bun test
omp plugin link .
```

## License

MIT
