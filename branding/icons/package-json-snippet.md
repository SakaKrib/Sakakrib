# package.json changes (apply from the repository root)

I could not edit your package.json or lockfile, so add these yourself. This keeps both files in sync:

```bash
npm install --save-dev sharp
npm pkg set scripts.generate:icons="node branding/icons/generate-icons.mjs"
```

`npm install` updates `package.json` and `package-lock.json` together. Skip the first line if `sharp` is already a dependency.
