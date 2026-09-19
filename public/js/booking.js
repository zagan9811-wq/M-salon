/* -------------------------------------------------------------------------
   The booking flow: day -> time -> details -> ticket.
   ------------------------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

const state = {
  config: null,
  date: null,
  day: null,
  time: null,
  timeLabel: null,
  booking: null
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const prettyDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

async function api(path, options) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The shop server did not answer. Try again.');
  return payload;
}

/* ------------------------------------------------------------------ days */

function renderDays(days) {
  const rail = $('days');
  rail.innerHTML = '';

  days.forEach((day) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'day';
    button.dataset.date = day.date;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', 'false');
    if (day.isToday) button.classList.add('is-today');
    button.disabled = day.closed || day.openCount === 0;

    const open = day.closed ? 'Closed' : day.openCount === 0 ? 'Full' : `${day.openCount} open`;
    button.innerHTML =
      `<span class="day__dow">${day.isToday ? 'Today' : day.dayShort}</span>` +
      `<span class="day__num">${day.dayOfMonth}</span>` +
      `<span class="day__open">${open}</span>`;
    button.setAttribute('aria-label', `${day.day} ${prettyDate(day.date)}, ${open}`);

    button.addEventListener('click', () => selectDay(day.date));
    rail.appendChild(button);
  });
}

async function selectDay(date) {
  state.date = date;
  state.time = null;
  state.timeLabel = null;

  document.querySelectorAll('.day').forEach((button) => {
    const on = button.dataset.date === date;
    button.classList.toggle('is-selected', on);
    button.setAttribute('aria-checked', String(on));
  });

  $('times').innerHTML = '<p class="loading">Loading times&hellip;</p>';
  updateSummary();

  try {
    const day = await api(`/api/availability?date=${encodeURIComponent(date)}`);
    state.day = day.day;
    renderTimes(day);
    updateSummary();
  } catch (error) {
    $('times').innerHTML = `<p class="muted">${error.message}</p>`;
  }
}

function renderTimes(day) {
  const grid = $('times');
  const hint = $('times-hours');
  grid.innerHTML = '';

  if (day.closed) {
    hint.textContent = 'The shop is shut that day.';
    grid.innerHTML = '<p class="closed-note">Closed. Pick another day.</p>';
    return;
  }

  hint.textContent = `Open ${day.hours.open} to ${day.hours.close}. Struck-out times are gone.`;

  if (!day.slots.some((slot) => slot.available)) {
    grid.innerHTML = '<p class="closed-note">Every slot is taken. Try the next day, or call the shop.</p>';
    return;
  }

  day.slots.forEach((slot) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'time';
    button.dataset.time = slot.time;
    button.textContent = slot.label;
    button.disabled = !slot.available;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', 'false');
    button.addEventListener('click', () => selectTime(slot.time, slot.label));
    grid.appendChild(button);
  });
}

function selectTime(time, label) {
  state.time = time;
  state.timeLabel = label;
  document.querySelectorAll('.time').forEach((button) => {
    const on = button.dataset.time === time;
    button.classList.toggle('is-selected', on);
    button.setAttribute('aria-checked', String(on));
  });
  updateSummary();
}

function updateSummary() {
  $('sum-date').textContent = state.date ? prettyDate(state.date) : '—';
  $('sum-day').textContent = state.day || '—';
  $('sum-time').textContent = state.timeLabel || '—';
  $('submit').disabled = !(state.date && state.time);
}

/* --------------------------------------------------------------- ticket */

function icsFile(booking) {
  const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//M Salon//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${booking.reference}@m-salon`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(booking.startsAt)}`,
    `DTEND:${stamp(booking.endsAt)}`,
    'SUMMARY:Haircut at M Salon',
    `DESCRIPTION:Reference ${booking.reference} — ${booking.price} ${booking.currency}`,
    'LOCATION:Kadhimiya\\, Baghdad',
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`;
}

function showTicket(booking) {
  state.booking = booking;
  const ticket = $('ticket');

  $('ticket-ref').textContent = booking.reference;
  $('ticket-name').textContent = booking.name;
  $('ticket-day').textContent = booking.day;
  $('ticket-date').textContent = prettyDate(booking.date);
  $('ticket-time').textContent = booking.timeLabel;
  $('ticket-price').textContent = `${booking.price} ${booking.currency}`;
  $('ticket-ics').href = icsFile(booking);

  const cancelled = booking.status === 'cancelled';
  ticket.classList.toggle('is-cancelled', cancelled);
  ticket.querySelector('.ticket__label').textContent = cancelled ? 'Cancelled' : 'Confirmed';
  $('ticket-cancel').hidden = cancelled;
  $('ticket-ics').hidden = cancelled;

  $('booking-form').hidden = true;
  ticket.hidden = false;
  ticket.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function resetForm() {
  state.time = null;
  state.timeLabel = null;
  state.booking = null;
  $('ticket').hidden = true;
  $('booking-form').hidden = false;
  $('booking-form').reset();
  document.querySelectorAll('.time.is-selected').forEach((b) => b.classList.remove('is-selected'));
  updateSummary();
  // The slot just sold is gone from the grid, so redraw the day before the
  // next customer can tap it again.
  if (state.date) selectDay(state.date);
}

/* ----------------------------------------------------------------- wire */

export async function initBooking(config) {
  state.config = config;
  $('sum-price').textContent = `${config.price.amount} ${config.price.currency}`;

  try {
    const { days } = await api('/api/calendar');
    renderDays(days);
    const first = days.find((day) => !day.closed && day.openCount > 0);
    if (first) await selectDay(first.date);
  } catch (error) {
    $('days').innerHTML = `<p class="muted">${error.message}</p>`;
  }

  $('booking-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = $('form-error');
    const submit = $('submit');
    error.hidden = true;

    submit.disabled = true;
    submit.textContent = 'Holding the chair…';

    try {
      const { booking } = await api('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          date: state.date,
          time: state.time,
          name: $('name').value,
          phone: $('phone').value,
          note: $('note').value
        })
      });
      showTicket(booking);
      refreshCalendar();
    } catch (problem) {
      error.textContent = problem.message;
      error.hidden = false;
      if (state.date) selectDay(state.date); // the grid may have moved on
    } finally {
      submit.disabled = !(state.date && state.time);
      submit.textContent = 'Confirm booking';
    }
  });

  $('ticket-cancel').addEventListener('click', async () => {
    if (!state.booking) return;
    if (!confirm('Cancel this booking? The slot goes back on sale straight away.')) return;
    try {
      const { booking } = await api(`/api/bookings/${state.booking.reference}`, { method: 'DELETE' });
      showTicket(booking);
      refreshCalendar();
      if (state.date) selectDay(state.date);
    } catch (problem) {
      alert(problem.message);
    }
  });

  $('ticket-again').addEventListener('click', resetForm);

  $('lookup-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = $('lookup-msg');
    const reference = $('lookup-ref').value.trim().toUpperCase();
    if (!reference) return;

    message.textContent = 'Looking…';
    try {
      const { booking } = await api(`/api/bookings/${encodeURIComponent(reference)}`);
      message.textContent = '';
      showTicket(booking);
    } catch (problem) {
      message.textContent = problem.message;
    }
  });
}

async function refreshCalendar() {
  try {
    const { days } = await api('/api/calendar');
    renderDays(days);
    if (state.date) {
      document.querySelectorAll('.day').forEach((button) => {
        const on = button.dataset.date === state.date;
        button.classList.toggle('is-selected', on);
        button.setAttribute('aria-checked', String(on));
      });
    }
  } catch {
    /* the rail keeps its last good state */
  }
}
