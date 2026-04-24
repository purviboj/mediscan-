# Medi-Scan Prototype

Small dependency-free web app for the Medi-Scan proposal and interactive prototype.

## Run locally

```bash
cd "/Users/saha/final mediscan/mediscan-"
npm install
npm run dev
```

Then open `http://localhost:3000`.

Notes:
- `npm run dev` and `npm start` run the same local server.
- If you run npm from the parent folder (`/Users/saha/final mediscan`), scripts will not work because `package.json` is inside `mediscan-`.

For the computer vision prototype on `/prototype.html`, allow webcam access in the browser.
The hand-tracking model is loaded from a CDN at runtime, so internet access is required for CV features.

## Deploy to Vercel

### Option 1: Vercel Dashboard (easiest)

1. Push this folder to GitHub/GitLab/Bitbucket.
2. In Vercel, click **Add New Project** and import the repo.
3. Set **Root Directory** to `mediscan-` (important if your repo root is `/Users/saha/final mediscan`).
4. Keep build settings empty/default:
   - Framework Preset: `Other`
   - Build Command: empty
   - Output Directory: empty
5. Click **Deploy**.

### Option 2: Vercel CLI

```bash
cd "/Users/saha/final mediscan/mediscan-"
npm i -g vercel
vercel
```

When prompted:
- Link to existing project? choose as needed
- Build command: leave blank
- Output directory: leave blank
- Override settings? No

Then for production:

```bash
vercel --prod
```

## Pages

- `/` proposal and project summary
- `/prototype.html` interactive touchless CT viewer demo with webcam hand tracking

## Using Real CT Slice Images

The prototype will automatically use real image slices if you place them in:

`/Users/purvibojedla/mediscan/ct-slices`

Name them in order, for example:

- `slice-01.png`
- `slice-02.png`
- `slice-03.png`

You can also use `.jpg` or `.jpeg`.

If the folder is missing or the files are not found, the app falls back to the synthetic CT-style viewer.
