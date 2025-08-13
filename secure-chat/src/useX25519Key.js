// src/useX25519Key.js
import { openDB } from 'idb';
import { useEffect, useState } from 'react';

const DB_NAME = 'secure-chat-keys', STORE = 'keys', PRIV_KEY = 'x25519-priv';

async function getOrCreateKey() {
  const db = await openDB(DB_NAME, 1, {
    upgrade(db) { db.createObjectStore(STORE); }
  });

  // Try to load existing CryptoKey
  let priv = await db.get(STORE, PRIV_KEY);
  if (!priv) {
    // Generate a non-exportable X25519 keypair
    priv = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'X25519' },
      false,                // not extractable
      ['deriveBits']
    );
    await db.put(STORE, priv, PRIV_KEY);
  }
  return priv;
}

export function useX25519Key() {
  const [pair, setPair] = useState(null); // { privKey, publicRaw: ArrayBuffer }

  useEffect(() => {
    let mounted = true;
    getOrCreateKey().then(async privKey => {
      // Export the public key in raw form to send to peers
      const publicRaw = await crypto.subtle.exportKey('raw', privKey.publicKey);
      if (mounted) setPair({ privKey, publicRaw });
    });
    return () => { mounted = false; };
  }, []);

  return pair;
}
