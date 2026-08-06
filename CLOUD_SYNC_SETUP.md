# Free Mobile And Desktop Sync

The application remains usable without an account. When cloud sync is enabled, `localStorage` is still the offline cache and a signed-in user's state is copied to Supabase.

## 1. Create The Free Database

1. Create a free project at [Supabase](https://supabase.com/dashboard).
2. In **SQL Editor**, run `supabase/migrations/202608060001_dictation_states.sql`.
3. In **Authentication -> URL Configuration**, set the Site URL to the future Pages URL and add both that URL and `http://127.0.0.1:5173` to Redirect URLs.
4. In **Project Settings -> API**, copy the Project URL and the `anon` public key. Do not use or expose the `service_role` key.
5. Create `.env.local` from `.env.example` and fill in those two values.

## 2. Test Locally

Run `npm run dev`, open Settings, and use the cloud-sync email login. The email link must open in the same browser/device. Existing local progress is merged into the cloud state on first successful login.

## 3. Deploy The Free Web App

1. Sign in to a free Cloudflare account and run `npx wrangler login`.
2. Build and deploy with `npm run deploy:pages`.
3. Add the generated `https://...pages.dev` address to Supabase Redirect URLs.
4. On a phone, open that address in Chrome/Edge/Safari and choose **Add to Home Screen**.

Audio is fetched and cached only when played. The complete audio collection is not downloaded during the first page load.

## Safety Rules

- `.env.local`, browser profiles, and `localStorage` are ignored by Git.
- The Supabase RLS policies permit a signed-in user to read and write only their own row.
- Do not put a Supabase `service_role` key in the application, Cloudflare variables, or chat.
