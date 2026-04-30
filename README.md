# Drama Circle

A Firebase-backed prototype for sharing drama ratings and recommendations with friends.

## What It Does

- Search MyDramaList first, then TMDb, then local starter data to auto-fill drama info, tags, and poster art.
- Add or update your own drama review with score, recommendation, and watch status.
- Discover dramas recommended by friends or matching tags from dramas you liked.
- See shared comparison pages for dramas rated by more than one person.
- Browse a friend's drama list and scores from the Friends tab.
- Search by drama title, genre, or friend name.
- Sign in with Firebase Auth and sync circle data through Firestore.
- Everyone who signs in joins the shared prototype circle `main`.

Drama lookup supports [MyDramaList](https://mydramalist.github.io/MDL-API/) and [TMDb](https://developer.themoviedb.org/docs/getting-started). TMDb lookup runs through a Firebase Cloud Function so the TMDb token is not exposed in frontend code.

## Firebase Setup

1. In Firebase Console, enable Authentication with Google sign-in and Email/Password.
2. In Authentication settings, add `127.0.0.1` and `localhost` as authorized domains if needed.
3. Create a Firestore database.
4. Publish the rules in `firestore.rules`.
5. Open the app from `http://127.0.0.1:4173` instead of `file://` for sign-in.

## TMDb Proxy Setup

Install the Firebase CLI if needed:

```bash
npm install -g firebase-tools
```

Install function dependencies:

```bash
cd functions
npm install
cd ..
```

Set the TMDb read token as a Firebase secret:

```bash
firebase functions:secrets:set TMDB_READ_ACCESS_TOKEN
```

When prompted, paste the TMDb **API Read Access Token**.

Deploy Firestore rules, hosting config, and the TMDb function:

```bash
firebase deploy
```

After deployment, local development calls:

```text
https://us-central1-dramacircle-aa198.cloudfunctions.net/tmdbSearch
```

Firebase Hosting calls the same function through:

```text
/api/tmdb-search
```

## Run Locally

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173
```

## Next Step

Replace the shared prototype circle `main` with invite-only circles so each friend group gets a private review pool.
