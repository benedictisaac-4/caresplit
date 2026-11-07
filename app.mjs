import QRCode from 'qrcode';
import { encode58, invoiceReference, isAddress, parseCents, paymentURL, readPayments } from './payments.mjs';

const el = id => document.getElementById(id);
const format = cents => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD'
}).format(cents / 100);
const decimal = cents => (cents / 100).toFixed(2);
const params = new URLSearchParams(location.hash.slice(1));
const storageKey = 'caresplit-practice-v1';
const checked = new Map();
const invoice = { cents: 30000 };
let receipts = [];
let loading = false;
let synced = false;
let creating = false;

function practiceReceipts() {
  try {
    const values = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(values) ? values.filter(value =>
      Number.isSafeInteger(value?.cents) && value.cents > 0 && value.cents <= 30000) : [];
  } catch {
    return [];
  }
}

const totalPaid = () => receipts.reduce((sum, receipt) => sum + receipt.cents, 0);
const remaining = () => Math.max(0, invoice.cents - totalPaid());

function render() {
  const paid = totalPaid();
  const due = remaining();
  el('balance').textContent = format(due);
  el('paid').textContent = `${format(paid)} contributed`;
  el('total').textContent = `${format(invoice.cents)} total`;
  el('progress').max = invoice.cents;
  el('progress').value = paid;
  el('bill-status').textContent = paid > invoice.cents ? 'Overpaid' : due === 0 ? 'Paid' : paid ? 'Partially paid' : 'Open';
  if (invoice.recipient && !synced) el('bill-status').textContent = 'Awaiting payment check';
  const unavailable = due === 0 || loading || (invoice.recipient && !synced);
  for (const control of el('payment').elements) control.disabled = unavailable;
  for (const chip of document.querySelectorAll('[data-amount]')) {
    chip.disabled = unavailable || Number(chip.dataset.amount) * 100 > due;
  }
  if (due === 0) el('wallet').hidden = true;
  el('refresh').disabled = loading;
  const items = receipts.map(({ cents, signature }) => {
    const item = document.createElement('li');
    item.textContent = `${format(cents)} · `;
    if (signature) {
      const link = document.createElement('a');
      link.href = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'View Devnet receipt';
      item.append(link);
    } else {
      item.append('Practice contribution');
    }
    return item;
  });
  if (!items.length) {
    const empty = document.createElement('li');
    empty.textContent = invoice.recipient && !synced ? 'Checking the Devnet ledger.' : 'No contributions yet.';
    items.push(empty);
  }
  el('history').replaceChildren(...items);
}

async function refresh() {
  if (loading) return;
  loading = true;
  render();
  el('message').textContent = 'Checking Solana Devnet for finalized payments…';
  try {
    const previous = totalPaid();
    receipts = await readPayments(invoice, checked);
    synced = true;
    if (totalPaid() !== previous) el('wallet').hidden = true;
    el('message').textContent = totalPaid() > invoice.cents
      ? `Received ${format(totalPaid() - invoice.cents)} above the bill total.`
      : remaining() === 0 ? 'This bill is paid in full.' : 'Payment history is up to date.';
  } catch (error) {
    synced = false;
    el('wallet').hidden = true;
    el('message').textContent = error.message || 'Could not check Devnet. Try again.';
  } finally {
    loading = false;
    render();
  }
}

for (const chip of document.querySelectorAll('[data-amount]')) {
  chip.onclick = () => { el('amount').value = decimal(Number(chip.dataset.amount) * 100); };
}
el('full').onclick = () => { el('amount').value = decimal(remaining()); };
el('amount').oninput = () => { el('wallet').hidden = true; };
el('refresh').onclick = refresh;

el('payment').onsubmit = async event => {
  event.preventDefault();
  if (loading) return;
  if (!invoice.recipient) receipts = practiceReceipts();
  const cents = parseCents(el('amount').value);
  if (!cents || cents > remaining()) {
    el('wallet').hidden = true;
    el('message').textContent = 'Enter an amount greater than zero and within the remaining balance.';
    render();
    return;
  }
  if (!invoice.recipient) {
    const updated = [{ cents }, ...receipts];
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {
      el('message').textContent = 'Browser storage is unavailable. Allow local storage to run practice payments.';
      return;
    }
    receipts = updated;
    el('message').textContent = `${format(cents)} practice payment recorded.`;
    render();
    return;
  }
  if (!synced) return;
  loading = true;
  render();
  try {
    const uri = paymentURL(invoice, cents);
    await QRCode.toCanvas(el('qr'), uri, { width: 220, errorCorrectionLevel: 'M' });
    el('wallet-link').href = uri;
    el('wallet').hidden = false;
    el('message').textContent = `Approve ${format(cents)} in your Devnet wallet, then check confirmed payments.`;
  } catch {
    el('wallet').hidden = true;
    el('message').textContent = 'Could not prepare the payment request. Try again.';
  } finally {
    loading = false;
    render();
  }
};

el('share').onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    el('share-status').textContent = invoice.recipient
      ? 'Family payment link copied.' : 'Practice link copied. Practice payments stay in this browser.';
  } catch {
    el('share-status').textContent = 'Copy the address from your browser to share this link.';
  }
};

el('create').onsubmit = event => {
  event.preventDefault();
  if (creating) return;
  const recipient = el('recipient').value.trim();
  const cents = parseCents(el('bill-amount').value);
  if (!isAddress(recipient) || !cents) {
    el('create-status').textContent = 'Enter a valid Solana public address and a positive amount with up to two decimal places.';
    return;
  }
  creating = true;
  const nonce = encode58(crypto.getRandomValues(new Uint8Array(32)));
  const target = new URL(location.href);
  target.hash = new URLSearchParams({ recipient, cents, nonce }).toString();
  location.assign(target);
};
window.addEventListener('hashchange', () => location.reload());
window.addEventListener('storage', event => {
  if (!invoice.recipient && event.key === storageKey) {
    receipts = practiceReceipts();
    render();
  }
});

async function init() {
  if (location.hash) {
    const recipient = params.get('recipient');
    const nonce = params.get('nonce');
    const cents = Number(params.get('cents'));
    if (!isAddress(recipient) || !isAddress(nonce) || !Number.isSafeInteger(cents) ||
        parseCents(decimal(cents)) !== cents) {
      el('payment').hidden = true;
      el('share').hidden = true;
      el('bill-status').textContent = 'Invalid link';
      el('message').textContent = 'This payment link is invalid. Ask for a fresh link or create a new demo bill.';
      return;
    }
    Object.assign(invoice, { recipient, cents, nonce });
    invoice.reference = await invoiceReference(invoice);
    el('mode').textContent = 'Solana Devnet';
    el('invoice-id').textContent = `Bill ${invoice.reference.slice(0, 8)}`;
    el('explanation').hidden = true;
    el('hospital').hidden = true;
    el('pay-help').textContent = 'Pay with test USDC on Solana Devnet. Confirm the receiving wallet with the bill issuer.';
    const recipientInfo = document.createElement('p');
    recipientInfo.className = 'muted';
    recipientInfo.textContent = `Receiving wallet: ${recipient}`;
    el('pay-help').after(recipientInfo);
    el('pay').textContent = 'Prepare Devnet payment';
    el('refresh').hidden = false;
    el('amount').value = decimal(Math.min(cents, 10000));
    await refresh();
  } else {
    receipts = practiceReceipts();
    render();
  }
}

init().catch(() => {
  el('payment').hidden = true;
  el('message').textContent = 'Checkout could not start. Open this page over HTTPS or localhost.';
});
