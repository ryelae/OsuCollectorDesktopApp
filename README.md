# osu! Collection Hub — Desktop

Desktop companion app for [osu! Collection Hub](https://github.com/ryelae/OsuCollectorWebApp), a private web app for sharing osu! stable beatmap collections with friends.

Built with Electron + React + TypeScript.

## What it does

- Connects to your hosted Collection Hub web app
- Browses uploaded collections from other users
- Resolves missing beatmap hashes to beatmapset IDs via the osu! API v1
- Downloads missing `.osz` files directly to your osu! Songs folder
- Writes the imported collection into your local `collection.db` automatically
- Skips beatmapsets you already have installed

## Requirements

- Windows (osu! stable is Windows-only)
- An instance of [osu! Collection Hub](https://github.com/ryelae/OsuCollectorWebApp) running somewhere (e.g. Fly.io)
- An [osu! API v1 key](https://osu.ppy.sh/p/api)
- An osu! OAuth Token

## Usage

### Running from source

```bash
npm install
npm run dev
```

### Building a portable executable

```bash
npm run package
```

Output: `dist/osu! Collection Hub <version>.exe`

### First-time setup

1. Open the **Settings** tab
2. Enter your Collection Hub URL and shared password
3. Enter your osu! API v1 key
4. Click **Auto-detect** to find your osu! Songs folder, or browse manually
5. Click **Save Settings** and **Test Connection**

### Importing a collection

1. Open the **Import Collections** tab
2. Click **Load Uploads** to fetch collections from the web app
3. Expand a user and select a collection
4. Wait for hashes to resolve via the osu! API
5. Click **Download & Import** — missing `.osz` files are downloaded and the collection is written to your `collection.db`
6. Open osu! and press **F5** to scan for new maps

## Tech stack

| Layer               | Technology                             |
| ------------------- | -------------------------------------- |
| Framework           | Electron 31                            |
| Build tool          | electron-vite                          |
| Frontend            | React 18, TypeScript                   |
| Styling             | CSS variables (light + dark mode)      |
| Settings            | electron-store                         |
| osu! path detection | Windows registry via winreg            |
| Downloads           | Node.js https module, multiple mirrors |

## Download mirrors

Missing beatmapsets are downloaded in order from:

1. [nerinyan.moe](https://nerinyan.moe)
2. [catboy.best](https://catboy.best)
3. [chimu.moe](https://chimu.moe)

## License

MIT
