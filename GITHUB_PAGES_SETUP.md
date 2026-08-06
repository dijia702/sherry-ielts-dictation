# GitHub Pages And Free Sync

The web release is published by GitHub Actions. GitHub Pages hosts the React app, vocabulary data, and audio; Supabase Free stores each user's progress.

## Repository And URL

- Repository: `https://github.com/dijia702/sherry-ielts-dictation`
- Pages URL: `https://dijia702.github.io/sherry-ielts-dictation/`
- Release branch: `release/v1.2.0`
- Development branch: `development`

The Vite build uses relative asset paths, so it works from the GitHub Pages subdirectory. The desktop `v1.1.0` shortcut remains a separate local release.

## Supabase Free Project

1. Create a free project at [Supabase](https://supabase.com/dashboard).
2. In **SQL Editor**, run `supabase/migrations/202608060001_dictation_states.sql`.
3. In **Authentication -> URL Configuration**, add:
   - `https://dijia702.github.io/sherry-ielts-dictation/`
   - `http://127.0.0.1:5173`
4. In **Project Settings -> API**, copy the Project URL and the browser-public `anon` key. Never use the `service_role` key.
5. Add them to the GitHub repository as Actions secrets named `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

The Actions workflow embeds these two public browser values during the build. If they are absent, the website still works locally but cloud sync remains disabled.

## Publishing

Pushing a commit to `release/v1.2.0` runs `.github/workflows/deploy-pages.yml` and publishes Pages automatically. The workflow also supports a manual **Run workflow** dispatch.

On a phone, open the Pages URL in Chrome, Edge, or Safari and choose **Add to Home Screen**. Audio is cached after it is played; the first visit does not download the full audio collection.

## Data Safety

- Browser progress remains local until the user signs in with email magic-link authentication.
- The first successful sign-in merges local and cloud state instead of replacing local progress.
- `.env.local`, browser profiles, and `localStorage` are excluded from Git.
- Supabase row-level security restricts each user to their own state row.
