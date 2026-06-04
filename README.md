# rommy.io

Minimal personal landing page at [https://rommy.io](https://rommy.io). A single centered “card” on a dark field: name, subtitle, a few outbound links, and a vCard QR code for saving contact details on a phone.

## Live site

- **URL:** [rommy.io](https://rommy.io)
- **Hosting:** [GitHub Pages](https://pages.github.com/) from this repo’s `main` branch
- **Custom domain:** `CNAME` → `rommy.io`

## What’s on the page

- **Title:** Rommy Ghaly (IBM Plex Mono)
- **Subtitle:** VP, Data @ CircleCI · Brooklyn, NY
- **Links:** LinkedIn, GitHub, CircleCI — ruled rows with category labels and a centered `@`
- **QR code:** Embedded PNG (vCard 4.0) for one-tap contact import on iOS/Android

## Stack

- Static HTML/CSS only — no build step, no framework
- Fonts: [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk), [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono), [Inter](https://fonts.google.com/specimen/Inter) via Google Fonts
- Optional dark theme via `data-theme="dark"` if `localStorage.theme` is set (no UI toggle on the page today)

## Local preview

From this directory:

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

## Deploy

Push to `main` on [github.com/fingerguns/identity](https://github.com/fingerguns/identity). GitHub Pages rebuilds automatically.

```bash
git add index.html CNAME   # and README.md when changed
git commit -m "Update landing page"
git push
```

## Repo layout

| File | Purpose |
|------|---------|
| `index.html` | Production page (deployed) |
| `CNAME` | Custom domain for GitHub Pages |
| `index-circleci.html` | Local-only theme experiments (not deployed) |
| `index-terminal.html` | Local-only theme experiments (not deployed) |

## Updating the vCard QR

Contact data is baked into the base64 image in `index.html`. Regenerate with a vCard 4.0 payload and your preferred QR tool, then replace the `<img src="data:image/png;base64,...">` in the `.qr-section` block.
