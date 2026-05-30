# GitHub Pages Fix for Alphabet-Trace
## Instructions for Claude Code

This document provides step-by-step instructions to restructure the `fariszaidannn/Alphabet-Trace` repository so that GitHub Pages serves the actual web app instead of the README.

---

## Context

Currently, GitHub Pages is rendering the `README.md` because there is no `index.html` at the repository root. The actual app lives inside the `alpha_trace/` subfolder. The fix requires one of the three approaches below. **Option A is recommended** — it requires no file restructuring and is the quickest to implement.

---

## Option A: GitHub Actions Workflow (Recommended)

This keeps the existing folder structure intact and deploys only the `alpha_trace/` subfolder to GitHub Pages.

### Step 1: Create the workflow directory

```bash
mkdir -p .github/workflows
```

### Step 2: Create the deployment workflow file

Create `.github/workflows/deploy.yml` with the following content:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Configure GitHub Pages
        uses: actions/configure-pages@v4

      - name: Upload alpha_trace folder as Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './alpha_trace'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

> **Note:** Replace `alpha_trace` with the exact folder name if it differs.

### Step 3: Create a `.nojekyll` file inside `alpha_trace/`

This prevents GitHub from running Jekyll processing on your files, which can break JavaScript and CSS paths.

```bash
touch alpha_trace/.nojekyll
```

### Step 4: Commit and push all changes

```bash
git add .github/workflows/deploy.yml alpha_trace/.nojekyll
git commit -m "Add GitHub Pages deployment workflow"
git push origin main
```

### Step 5: Update GitHub Pages source setting

1. Go to the repository on GitHub
2. Click **Settings** → **Pages** (left sidebar)
3. Under **Build and deployment → Source**, select **GitHub Actions**
4. Save — the action will trigger automatically on the next push

---

## Option B: Change the Pages Folder in Settings (No Code Changes)

Use this only if `alpha_trace/` already contains an `index.html` and you do not want to create a workflow file.

1. Go to **Settings → Pages** in the repository
2. Under **Build and deployment → Source**, select **Deploy from a branch**
3. Set the branch to `main` and the folder to `/alpha_trace`
4. Click **Save**

> GitHub Pages will now serve directly from the `alpha_trace/` subfolder.

---

## Option C: Move App Files to Repository Root (Restructure)

Use this if you want the app files at the top level of the repository.

### Step 1: Move all files from `alpha_trace/` to root

```bash
mv alpha_trace/* .
mv alpha_trace/.* . 2>/dev/null || true
rmdir alpha_trace
```

### Step 2: Add a `.nojekyll` file at root

```bash
touch .nojekyll
```

### Step 3: Commit and push

```bash
git add -A
git commit -m "Move app to root for GitHub Pages"
git push origin main
```

### Step 4: Verify Pages settings

1. Go to **Settings → Pages**
2. Source should be **Deploy from a branch**, branch `main`, folder `/ (root)`
3. Save if not already set

---

## Verification Checklist

After applying any of the options above, confirm the following:

- [ ] `index.html` exists at the path GitHub Pages is configured to serve
- [ ] A `.nojekyll` file is present in that same directory
- [ ] GitHub Pages **Source** setting matches the chosen option
- [ ] The GitHub Actions workflow run (if using Option A) shows a green checkmark in the **Actions** tab
- [ ] Visiting `https://fariszaidannn.github.io/Alphabet-Trace` loads the app, not the README

---

## File Structure After Option A (No Changes to App Code)

```
Alphabet-Trace/
├── .github/
│   └── workflows/
│       └── deploy.yml        ← NEW
├── alpha_trace/
│   ├── .nojekyll             ← NEW
│   ├── index.html            ← existing app entry point
│   └── (all other app files)
├── add_lowercase.py
├── fix_waypoints.py
├── .gitignore
└── README.md
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Site still shows README | Pages source not updated to GitHub Actions | Go to Settings → Pages → change Source to GitHub Actions |
| 404 on the Pages URL | Workflow hasn't run yet | Check the Actions tab; re-push if needed |
| CSS/JS files not loading | Jekyll is processing files | Ensure `.nojekyll` exists in the served directory |
| Workflow fails with permissions error | Pages write permission not set | Confirm the `permissions` block in `deploy.yml` includes `pages: write` and `id-token: write` |
| Changes not reflected after push | GitHub Pages caches aggressively | Wait 2–3 minutes and hard-refresh (`Ctrl+Shift+R`) |

