/** Solana base58 address (32-44 chars, no 0/O/I/l). */
export const BASE58_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** Solana base58 signature (64-88 chars). */
export const BASE58_SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
