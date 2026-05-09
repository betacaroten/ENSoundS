import { createPublicClient, http, fallback } from "viem";
import { mainnet } from "viem/chains";

export const DEFAULT_RPC = "";

const PUBLIC_RPCS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.merkle.io",
  "https://1rpc.io/eth",
  "https://rpc.ankr.com/eth",
  "https://eth.llamarpc.com",
];

const resolveCache = new Map();

const BATCH_OPTS = { batch: { batchSize: 50, wait: 16 } };

export function makeClient(rpcUrl) {
  const trimmed = (rpcUrl || "").trim();
  const transport = trimmed
    ? http(trimmed, { retryCount: 1, retryDelay: 300, ...BATCH_OPTS })
    : fallback(
        PUBLIC_RPCS.map((u) => http(u, { retryCount: 0, ...BATCH_OPTS })),
        { retryCount: 1, retryDelay: 300 }
      );
  return createPublicClient({ chain: mainnet, transport });
}

export async function getLatestBlockNumber(client) {
  return await client.getBlockNumber();
}

export async function getBlockWithTxs(client, blockNumber) {
  return await client.getBlock({ blockNumber, includeTransactions: true });
}

export function uniqueFromAddresses(block) {
  const seen = new Set();
  const out = [];
  for (const tx of block.transactions) {
    const addr = tx.from;
    if (!addr) continue;
    const lower = addr.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(addr);
  }
  return out;
}

export async function resolveEnsNames(client, addresses) {
  const tasks = addresses.map(async (addr) => {
    const key = addr.toLowerCase();
    if (resolveCache.has(key)) {
      return { address: addr, name: resolveCache.get(key) };
    }
    try {
      const name = await client.getEnsName({ address: addr });
      resolveCache.set(key, name ?? null);
      return { address: addr, name: name ?? null };
    } catch (e) {
      return { address: addr, name: null, error: e };
    }
  });
  return await Promise.all(tasks);
}

export function clearResolveCache() {
  resolveCache.clear();
}
