# QR Code API

Generates QR codes as SVG, PNG or JSON in pure JavaScript, no external service: URL, Wi-Fi, email, phone, geo and vCard payloads, colours, size, error correction. Endpoints: `GET|POST /qr`, batch.

MIT licensed. Runs as a single Cloudflare Worker with no database and no paid dependencies.

## Self-host on Cloudflare Workers (free plan)

```sh
npm i -g wrangler
wrangler login
wrangler deploy
wrangler secret put PROXY_SECRET   # any long random string you choose
```

Every route except `/health` requires the header `X-RapidAPI-Proxy-Secret` to equal your `PROXY_SECRET`.
Without that secret set, protected routes return 403. (Edit `worker.js` if you want the routes open.)
Run the tests with `node test.mjs`. See `openapi.yaml` for the endpoints.

The Workers Free plan allows 100,000 requests per day, per https://developers.cloudflare.com/workers/platform/limits/ (read 2026-11-20).

## Hosted version

A hosted version is not listed yet. Self-host it above.

## Support / sponsor

If this saves you time, sponsor the open-source APIs: https://buy.stripe.com/6oU5kwaPJ4Gg0Fc0Eb0x41A
