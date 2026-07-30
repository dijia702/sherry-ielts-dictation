# Version Management

This repository separates the installed desktop application from future work.

## References

| Reference | Purpose | Rule |
| --- | --- | --- |
| `desktop-active` | Source snapshot matching the program opened by the desktop shortcut | Do not develop directly on this branch. Move it only after an installed-app hash check. |
| `release/vX.Y.Z` | Source approved for a distributable installer | One branch and one annotated tag per released version. |
| `development` | Ongoing local feature work | Test here before creating a release. |

The current desktop shortcut targets `E:\li\sherry-ielts-dictation\Sherry 雅思听写.exe`. It is independent from this source directory until a release is deliberately deployed.

## Current Baseline

- Version: `1.1.0`
- Desktop/release `app.asar` SHA-256: `68F7A9501B84884F62865AB2E98DDDBE48F76B4D4FC012BC4EA7D65BD56A7462`
- Shortcut origin: `http://127.0.0.1:5173/`
- Learning progress: browser `localStorage`, deliberately excluded from Git and installers.

## Release Procedure

1. Work and test on `development`.
2. Commit the completed source change.
3. Create `release/vX.Y.Z` from the approved commit and update `package.json` version.
4. Run `npm test`, `npm run build`, and `npm run package:win`.
5. Use `scripts/verify_desktop_release.ps1` to compare the packaged and installed `app.asar` hashes after deployment.
6. Only after the hash matches, advance `desktop-active` to the release commit and create annotated tag `vX.Y.Z`.

Never copy browser profiles, `localStorage`, `output/`, or release installers into Git.
