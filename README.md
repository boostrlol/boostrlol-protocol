# BOOSTR

**Trading fees that find their creator.**

[![Live site](https://img.shields.io/badge/live-boostr.lol-1ad4bf?style=flat-square)](https://boostr.lol)
![Chain](https://img.shields.io/badge/chain-Solana-946bef?style=flat-square)

| | |
|---|---|
| Chain | Solana |
| Contract address | _pending_ |

## Overview

BOOSTR pairs a Solana token with a public handle and routes a share of its trading fees to the creator behind that handle. The site shows the wider market as it moves, and gives the BOOSTR token the first row of the board.

## Features

- Live market board of the top boosted Solana pairs, ranked by 24h volume
- Pinned own-token row that wakes up the moment a contract address is stated
- Ticker, stat tiles and volume chart fed by the same live data
- Every external fact lives in one register record, and unstated records render inert
- Motion that respects `prefers-reduced-motion`

## Links

- Site: https://boostr.lol
- Whitepaper: [docs/whitepaper.md](docs/whitepaper.md)
- X: _pending_
- GitHub: _pending_

## Development

```bash
npm install
npm run build     # writes dist/
npm run gates     # runs every gate against dist/ and both contract-address branches
```

Edit `register.json` to change what the site treats as stated. Upload the contents of `dist/` to deploy.

## License

MIT, see [LICENSE](LICENSE).
