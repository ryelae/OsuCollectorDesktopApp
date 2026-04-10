# osu! Collection Hub — Desktop

Desktop companion app for [osu! Collection Hub](https://github.com/ryelae/OsuCollectorWebApp). Browse and import your friends' osu! stable beatmap collections — maps are downloaded directly from osu!'s servers and written straight into your local `collection.db`.

Built with Electron + React + TypeScript.

## What it does

- Connects to a hosted Collection Hub web app (run by you or a friend)
- Browses uploaded collections by user
- Resolves beatmap hashes to beatmapset IDs via the osu! API v1
- Downloads missing `.osz` files directly from osu!'s servers
- Writes the imported collection into your local `collection.db` automatically
- Skips beatmapsets you already have installed

## Requirements

- Windows (osu! stable is Windows-only)
- Access to a running [osu! Collection Hub](https://github.com/ryelae/OsuCollectorWebApp) instance (URL + password from whoever hosts it)
- An [osu! API v1 key](https://osu.ppy.sh/p/api) (free, takes 1 minute)
- An osu! OAuth application (free, takes 2 minutes (see setup below))

## First-time setup

### 1. Connect to the web app

Open **Settings → Web App Connection**. Enter the URL and shared password from whoever is hosting the web app, then click **Test Connection**.

### 2. Get an osu! API v1 key

1. Go to [osu.ppy.sh/p/api](https://osu.ppy.sh/p/api) and log in
2. Fill in any application name and URL (e.g. `http://localhost`)
3. Copy the key and paste it into **Settings → osu! API Key**

### 3. Set up osu! OAuth (for direct downloads)

This lets the app download maps directly from osu!'s servers rather than third-party mirrors.

1. Go to [osu.ppy.sh/home/account/edit](https://osu.ppy.sh/home/account/edit) and scroll down to **OAuth Applications**
2. Click **New OAuth Application**
3. Give it any name (e.g. `osu hub desktop`)
4. Set the **Callback URL** to exactly: `http://127.0.0.1/osu-hub-callback`
5. Click **Register**
6. Copy the **Client ID** and **Client Secret** into **Settings → osu! Account**
7. Click **Log in to osu!** — a browser window will open for you to approve access, then close automatically

### 4. Set your Songs folder

In **Settings → osu! Songs Folder**, click **Auto-detect**. If it doesn't find it, click **Browse** and navigate to your osu! Songs folder manually (usually `C:\Users\<you>\AppData\Local\osu!\Songs`).

### 5. Import a collection

1. Go to the **Import Collections** tab
2. Collections load automatically — search by uploader name or collection name to find what you want
3. Click a collection to see which maps you're missing
4. Click **Download & Import** — missing beatmapsets are downloaded and the collection is added to your `collection.db`
5. Press **F5** in osu! to scan for new maps, then fully restart osu! to see the new collection in your list

## Running from source

```bash
npm install
npm run dev
```

## Building a portable executable

```bash
npm run package
```

Output: `dist/osu! Collection Hub <version>.exe`

## Tech stack

| Layer               | Technology                                                             |
| ------------------- | ---------------------------------------------------------------------- |
| Framework           | Electron 31                                                            |
| Build tool          | electron-vite                                                          |
| Frontend            | React 18, TypeScript                                                   |
| Settings            | electron-store                                                         |
| osu! path detection | Windows registry via winreg                                            |
| Downloads           | osu! API v2 (OAuth), nerinyan.moe / osu.direct / beatconnect fallbacks |

## License

MIT
