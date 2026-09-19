# M Salon

The booking site for M Salon — Mohammed Qasim's barbershop in Kadhimiya, Baghdad.

One page, four sections (Book · Products · About · Visit), a real appointment
book behind it, and an owner's diary at `/admin`.

```
server/      Express API + SQLite
public/      the site itself (no build step, no framework)
data/        products.json and the SQLite file
```

## Run it locally

```bash
npm install
npm start          # http://localhost:3000
```

`npm run dev` restarts on save.

## Deploy on Railway

1. Push this repository to GitHub, then **New Project → Deploy from GitHub repo**
   in Railway and pick it. `railway.json` already sets the start command and
   points the healthcheck at `/healthz`; nothing else needs configuring.
2. **Add a volume** (Service → Data → Add Volume) mounted at `/data`. Railway's
   filesystem is wiped on every deploy, so without a volume the appointment
   book empties each time you push.
3. Set the variables under Service → Variables:

   | Variable        | Value                              |
   | --------------- | ---------------------------------- |
   | `DATABASE_PATH` | `/data/salon.db`                   |
   | `ADMIN_KEY`     | a long random string you keep       |
   | `SHOP_TIMEZONE` | `Asia/Baghdad` (the default)        |
   | `PRICE`         | `25` (the default)                  |
   | `CURRENCY`      | `IQD` (the default)                 |

   `PORT` is injected by Railway — leave it alone.
4. Generate a domain under Settings → Networking.

`.env.example` lists every variable with its default.

## Day-to-day

**The diary.** `/admin` lists every upcoming appointment, newest day first, with
the phone number a tap away and a cancel button beside each one. It asks for
`ADMIN_KEY` once per browser session and stays off entirely while that variable
is empty.

**Changing the hours.** `server/config.js` holds the week, one line per day
(`0` is Sunday). Set a day to `null` to close it. Shut a single date — a feast
day, a wedding — by adding it to `closedDates` as `'2026-10-05'`.

Other knobs in the same file: `slotMinutes` (how long one appointment runs),
`horizonDays` (how far ahead the calendar opens), `leadMinutes` (how close to
the hour someone may still book today), and `maxPerPhone` (how many upcoming
appointments one number may hold).

**Adding products.** `data/products.json` is a plain list. Drop the pictures in
`public/assets/` and point at them:

```json
{
  "products": [
    {
      "name": "Beard oil",
      "description": "The one used at the chair.",
      "price": "10",
      "currency": "IQD",
      "image": "/assets/beard-oil.jpg"
    }
  ]
}
```

While the list is empty the Products section shows its "being stocked" note, so
an empty shelf still looks deliberate. Every field is optional except `name`.

## The API

| Method   | Path                        | Does                                          |
| -------- | --------------------------- | --------------------------------------------- |
| `GET`    | `/api/config`               | shop details, price, hours, today's date        |
| `GET`    | `/api/calendar`             | the next 14 days with a free-slot count         |
| `GET`    | `/api/availability?date=`   | every slot on one day, taken or free            |
| `POST`   | `/api/bookings`             | book a slot, returns the reference              |
| `GET`    | `/api/bookings/:reference`  | look one up                                     |
| `DELETE` | `/api/bookings/:reference`  | cancel it                                       |
| `GET`    | `/api/products`             | the shelf                                       |
| `GET`    | `/api/admin/bookings`       | the diary (needs `x-admin-key`)                 |

A slot cannot be sold twice: the database holds a unique index over
(date, time) for live bookings, so two people tapping the same time in the same
second means one of them gets told to pick again. Cancelled rows stay behind for
the owner's history but put the slot back on sale.

## Notes on the front end

No framework and no build step — three ES modules and one stylesheet.

* `public/js/scroll.js` — the tab bar. Jumps are animated by hand on an
  ease-out-exponential curve, so a section leaves fast and settles slowly, and
  any wheel, touch or key press cancels the animation. The marker under the tabs
  is interpolated against scroll position rather than snapped.
* `public/js/booking.js` — day → time → details → ticket, including the
  calendar file the ticket hands you.
* `public/js/site.js` — the shop's own details: hours, phone, map, products.

Colours come off the logo (the black disc, the cream crown, the grey M) with the
signal yellow from the shop's signage; the type is Archivo with IBM Plex Mono
for anything numeric.
