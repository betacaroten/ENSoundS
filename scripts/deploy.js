#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { PinataSDK } from "pinata";

const jwt = process.env.PINATA_JWT;
if (!jwt) {
  console.error("Missing PINATA_JWT env var.");
  console.error("Get one at https://app.pinata.cloud/developers/api-keys (admin scope: pinFileToIPFS).");
  console.error("Then run with:  PINATA_JWT=<jwt> npm run deploy");
  process.exit(1);
}

const distDir = path.resolve("dist");
if (!fs.existsSync(distDir)) {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}

function* walk(dir, base = dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full, base);
    else yield { full, rel: path.relative(base, full).split(path.sep).join("/") };
  }
}

const files = [];
for (const f of walk(distDir)) {
  const buf = fs.readFileSync(f.full);
  files.push(new File([buf], f.rel));
}
console.log(`Uploading ${files.length} files (${(files.reduce((n, f) => n + f.size, 0) / 1024).toFixed(1)} KB)…`);

const pinata = new PinataSDK({
  pinataJwt: jwt,
  pinataGateway: "gateway.pinata.cloud",
});

try {
  const result = await pinata.upload.public.fileArray(files).name("ensounds");
  const cid = result.cid;
  console.log();
  console.log(`✓ pinned`);
  console.log(`  CID:     ${cid}`);
  console.log(`  preview: https://gateway.pinata.cloud/ipfs/${cid}/`);
  console.log();
  console.log("Next steps:");
  console.log(`  1. Open the preview URL above and confirm the site loads.`);
  console.log(`  2. Visit https://app.ens.domains/ensounds.alzbeta.eth`);
  console.log(`     (create the subdomain under alzbeta.eth if needed)`);
  console.log(`  3. Records → Content → ipfs://${cid}`);
  console.log(`  4. Sign the tx, then visit https://ensounds.alzbeta.limo`);
} catch (e) {
  console.error("Upload failed:", e?.message || e);
  if (e?.response) console.error(e.response);
  process.exit(1);
}
