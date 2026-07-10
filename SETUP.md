# Dairy Farm Manager — Setup Guide

This turns your farm app into a real installable website with proper login,
so it works the same on your phone and laptop. Follow these steps in order.
Everything here is free.

Total time: about 30-40 minutes, done once.

---

## Step 1 — Create your database (Supabase)

1. Go to https://supabase.com and click **Start your project** (sign up free, e.g. with your email or GitHub).
2. Click **New project**. Give it any name (e.g. "dairy-farm"), set a database password (save it somewhere), choose the region closest to you, click **Create new project**. Wait ~2 minutes while it sets up.
3. Once it's ready, click the **SQL Editor** icon in the left sidebar.
4. Click **New query**.
5. Open the file `supabase_schema.sql` (included in this project folder), copy ALL of its contents, and paste them into the SQL editor.
6. Click **Run** (or press Ctrl/Cmd+Enter). You should see "Success. No rows returned." This created all your tables.
7. In the left sidebar, click the gear icon **Project Settings** → **API**.
8. You'll see two values you need:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (a long string under "Project API keys")
   Keep this browser tab open — you'll paste these in Step 3.

By default, Supabase requires email confirmation before login. For a personal farm app,
you can turn this off to make signup instant:
- Go to **Authentication** → **Providers** → **Email**, and turn OFF "Confirm email".
(Or leave it on — you'll just need to click a confirmation link in your email after signing up once.)

---

## Step 2 — Put the code on GitHub

1. Go to https://github.com and sign up free if you don't have an account.
2. Click the **+** icon (top right) → **New repository**.
3. Name it `dairy-farm-app`, keep it **Private** (recommended), click **Create repository**.
4. On the next page, click **uploading an existing file**.
5. Unzip the project folder you downloaded from this chat, then drag ALL its files and folders into the GitHub upload box.
6. Scroll down, click **Commit changes**.

---

## Step 3 — Deploy it live (Vercel)

1. Go to https://vercel.com and sign up free using your GitHub account (easiest — click "Continue with GitHub").
2. Click **Add New...** → **Project**.
3. Find and **Import** your `dairy-farm-app` repository.
4. Before clicking Deploy, open **Environment Variables** and add these two (from Step 1.8):
   - Name: `VITE_SUPABASE_URL` — Value: your Project URL
   - Name: `VITE_SUPABASE_ANON_KEY` — Value: your anon public key
5. Click **Deploy**. Wait about a minute.
6. You'll get a live link like `https://dairy-farm-app.vercel.app` — this is your app's permanent address.

---

## Step 4 — Use it

1. Open your new link in Safari (iPhone) or Chrome (Android).
2. Tap **Sign up**, enter your email and a password, create your account.
3. If email confirmation is on, check your email and click the confirm link, then log in.
4. You're in — add your cows, log milk, everything works exactly like before, but now it's really yours.
5. Tap **Share → Add to Home Screen** (iPhone) or the browser menu **→ Install app** (Android).
6. You now have a real app icon that opens directly to your farm data, logged in, on any device.

---

## Keeping it updated later

If you ever want me to add more features, I'll give you an updated project.
Just repeat Step 2 (upload the new files to the same GitHub repo, overwriting the old ones) —
Vercel will automatically redeploy within a minute or two. No need to redo Steps 1 or 3.

---

## Troubleshooting

- **"Setup needed" screen shows up:** your environment variables weren't saved correctly in Vercel. Go to your Vercel project → Settings → Environment Variables, double check both are there, then go to Deployments → click the three dots on the latest one → Redeploy.
- **Sign up says "check your email" but nothing arrives:** check spam, or turn off "Confirm email" in Supabase (Step 1, last note).
- **Data not showing:** make sure you're logged into the same account you signed up with — each login only sees its own data (that's what keeps your farm records private).
