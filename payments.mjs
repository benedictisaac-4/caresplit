export const MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const MAX_CENTS = 100_000_000;

export function encode58(bytes) {
  let value = bytes.reduce((n, byte) => n * 256n + BigInt(byte), 0n);
  let result = '';
  while (value) {
    result = ALPHABET[Number(value % 58n)] + result;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    result = '1' + result;
  }
  return result;
}

function decode58(text) {
  let value = 0n;
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) return new Uint8Array();
    value = value * 58n + BigInt(digit);
  }
  const bytes = [];
  while (value) {
    bytes.push(Number(value & 255n));
    value >>= 8n;
  }
  for (const char of text) {
    if (char !== '1') break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

export function isAddress(value) {
  return typeof value === 'string' && value.length >= 32 &&
    value.length <= 44 && decode58(value).length === 32;
}

export function parseCents(value) {
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const cents = Math.round(Number(value) * 100);
  return cents > 0 && cents <= MAX_CENTS ? cents : null;
}

export async function invoiceReference({ recipient, cents, nonce }) {
  const content = new TextEncoder().encode(JSON.stringify(['caresplit-v1', recipient, cents, nonce]));
  return encode58(new Uint8Array(await crypto.subtle.digest('SHA-256', content)));
}

export function paymentURL(invoice, cents) {
  const query = new URLSearchParams({
    amount: (cents / 100).toFixed(2),
    'spl-token': MINT,
    reference: invoice.reference,
    label: 'CareSplit Devnet',
    message: 'Fictional hospital bill'
  });
  return `solana:${invoice.recipient}?${query}`;
}

export function verifiedCents(result, invoice) {
  if (!result?.meta || result.meta.err !== null) return null;
  const { meta, transaction } = result;
  const { message } = transaction;
  const keys = [...message.accountKeys, ...(meta.loadedAddresses?.writable ?? []),
    ...(meta.loadedAddresses?.readonly ?? [])];
  const instruction = message.instructions.at(-1);
  if (!instruction || keys[instruction.programIdIndex] !== TOKEN_PROGRAM) return null;
  const data = decode58(instruction.data);
  const checked = data[0] === 12 && data.length === 10 && data[9] === 6;
  const unchecked = data[0] === 3 && data.length === 9;
  if (!checked && !unchecked) return null;
  const destination = instruction.accounts[checked ? 2 : 1];
  const source = instruction.accounts[0];
  if (destination === source || (checked && keys[instruction.accounts[1]] !== MINT)) return null;
  if (!instruction.accounts.slice(checked ? 4 : 3).some(index => keys[index] === invoice.reference)) return null;
  const post = meta.postTokenBalances?.find(balance => balance.accountIndex === destination);
  if (post?.owner !== invoice.recipient || post.mint !== MINT || post.uiTokenAmount.decimals !== 6) return null;
  const pre = meta.preTokenBalances?.find(balance => balance.accountIndex === destination);
  const amount = new DataView(data.buffer).getBigUint64(1, true);
  const credited = BigInt(post.uiTokenAmount.amount) - BigInt(pre?.uiTokenAmount.amount ?? '0');
  if (amount !== credited || amount <= 0n || amount % 10000n || amount > BigInt(MAX_CENTS) * 10000n) return null;
  return Number(amount / 10000n);
}

async function rpc(method, params) {
  const response = await fetch('https://api.devnet.solana.com', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('Devnet is busy. Try again shortly.');
  const { error, result } = await response.json();
  if (error) throw new Error('Devnet could not check the payment. Try again shortly.');
  return result;
}

export async function readPayments(invoice, checked) {
  const signatures = await rpc('getSignaturesForAddress', [invoice.reference, { commitment: 'finalized', limit: 51 }]);
  if (signatures.length > 50) throw new Error('This demo invoice has reached its 50 transaction limit.');
  const receipts = [];
  for (const { signature, err } of signatures) {
    if (err) continue;
    if (!checked.has(signature)) {
      const tx = await rpc('getTransaction', [signature, {
        encoding: 'json', commitment: 'finalized', maxSupportedTransactionVersion: 0
      }]);
      if (!tx) throw new Error('Devnet is still indexing a payment. Try again shortly.');
      checked.set(signature, verifiedCents(tx, invoice));
    }
    const cents = checked.get(signature);
    if (cents !== null) receipts.push({ cents, signature });
  }
  return receipts;
}
