# Medi-Scan Prototype

Small dependency-free web app for the Medi-Scan proposal and interactive prototype.

## Run

```bash
npm start
```

Then open `http://localhost:3000`.

For the computer vision prototype on `/prototype.html`, allow webcam access in the browser.
The hand-tracking model is loaded from a CDN at runtime, so internet access is required for the CV features.

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
