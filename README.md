# CareSplit

CareSplit is an open-source Solana hackathon prototype for paying a hospital bill with help from family. Each contribution reduces the same balance, and Devnet payments include a verifiable receipt.

## Try it

1. Open the [CareSplit demo](https://benedictisaac-4.github.io/caresplit/).
2. In practice mode, record a $100 contribution on the fictional $300 bill. Use **Pay balance** to finish the bill. Practice payments are saved in your browser.
3. To test Solana, enter a Devnet receiving wallet you control and create a demo bill. Copy the payment link to share it.
4. Use a wallet that supports Solana Pay on Devnet. Fund the payer with test [USDC](https://faucet.circle.com/) and [SOL for fees](https://faucet.solana.com/). Set up the receiving wallet's Devnet USDC token account before the demo, for example by funding it with test USDC.
5. Enter a partial amount, scan the QR code, approve the transfer, then select **Check confirmed payments**. Open the same payment link on a different device to check the shared balance and receipts.

## How payments are matched

CareSplit uses a Solana Pay transfer request with a reference derived from a random invoice nonce, receiving wallet and total. The site finds finalized transactions with that reference and checks the SPL Token instruction, reference, Devnet USDC mint, recipient ownership and actual credited amount before counting a receipt. Changing the invoice amount or recipient produces a separate reference. Payment confirmation runs in the browser against Solana's public Devnet RPC.

The GitHub Pages app is a static prototype. The hospital and bill details are fictional. Payment links include the public receiving address, sample amount and nonce. The prototype has no hospital identity verification, authenticated billing integration or AI service. Concurrent payments can exceed the total, in which case the UI shows the overpayment. Reconciliation is limited to 50 referenced transactions per bill. Production use would require authenticated invoices, server-side reconciliation, and a plan for refunds and settlement.

## Run locally

Use Node.js 20 or later and Python 3.

```sh
npm ci
npm run check
npm run build
python3 -m http.server 8000
```

Open [localhost:8000](http://localhost:8000/). The Pages deployment serves the repository root. After editing the source, rebuild `app.js` before committing.

## License

MIT. See [LICENSE](LICENSE) and the [bundled dependency notices](THIRD-PARTY-NOTICES.txt).
