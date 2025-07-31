import React, { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import sodium from "libsodium-wrappers";
import "./SecureChat.css";

const KEYPAIR_STORAGE = "securechat.keypair";
const PEERKEY_STORAGE = (peer) => `securechat.peer.${peer}`;

export default function SecureChat({ currentUser, toUser, convId }) {
  const [ready, setReady]       = useState(false);
  const [messages, setMessages] = useState([]); // { seq, user, text, type, timestamp }
  const [input, setInput]       = useState("");
  const [sendSeq, setSendSeq]   = useState(0);
  const [recvSeq, setRecvSeq]   = useState(-1);
  const [log, setLog]           = useState([]);

  const socketRef    = useRef(null);
  const myKeyPair    = useRef(null);
  const sessionKey   = useRef(null);
  const B64          = useRef(null);
  const sentFlag     = useRef(false);
  const messagesEnd  = useRef(null);

  const logMsg = (msg) => {
    setLog(l => [...l, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };
  const saveJSON = (k,o) => localStorage.setItem(k, JSON.stringify(o));
  const loadJSON = (k)   => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

  // auto‐scroll to bottom on new message
  useEffect(() => {
    if (messagesEnd.current) {
      messagesEnd.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // derive session key from peer public key
  const deriveSessionKey = useCallback((peerPubBytes) => {
    const shared = sodium.crypto_scalarmult(
      myKeyPair.current.privateKey,
      peerPubBytes
    );
    sessionKey.current = sodium.crypto_kdf_derive_from_key(
      32, 1, "chat-session-key", shared
    );
    setReady(true);
    logMsg("✅ Session key ready");
  }, []);

  // one‐time sodium + socket setup
  useEffect(() => {
    let cancelled = false;
    sodium.ready.then(async () => {
      if (cancelled) return;
      B64.current = sodium.base64_variants.ORIGINAL;

      // 1) load/generate long‐term keypair
      const storedKP = loadJSON(KEYPAIR_STORAGE);
      if (storedKP) {
        logMsg("🔑 Loaded keypair");
        myKeyPair.current = {
          publicKey:  sodium.from_base64(storedKP.pub,  B64.current),
          privateKey: sodium.from_base64(storedKP.priv, B64.current)
        };
      } else {
        logMsg("🔑 Generating keypair");
        const kp = sodium.crypto_kx_keypair();
        myKeyPair.current = kp;
        saveJSON(KEYPAIR_STORAGE, {
          pub:  sodium.to_base64(kp.publicKey,  B64.current),
          priv: sodium.to_base64(kp.privateKey, B64.current)
        });
      }

      // 2) if peer pubkey cached, derive immediately
      const cached = loadJSON(PEERKEY_STORAGE(toUser));
      if (cached) {
        logMsg("👥 Using cached peer pubkey");
        deriveSessionKey(sodium.from_base64(cached, B64.current));
      }

      // 3) connect Socket.IO
      const sio = io("http://localhost:5000", { withCredentials: true });
      socketRef.current = sio;

      // on connect: join room + send our pubkey
      const onConnect = () => {
        logMsg("🟢 Socket connected");
        sio.emit("join_room", { conv_id: convId });
        logMsg(`🚪 Joined room ${convId}`);
        sio.emit("exchange_keys", {
          to: toUser,
          pub_key: sodium.to_base64(myKeyPair.current.publicKey, B64.current)
        });
        sentFlag.current = true;
        logMsg(`📡 Sent pubkey to ${toUser}`);
        setTimeout(() => sentFlag.current = false, 1000);
      };

      // on peer_key: cache + derive + maybe re‐send ours
      const onPeerKey = ({ from, pub_key }) => {
        if (from !== toUser) return;
        logMsg(`👂 Got peer_key from ${from}`);
        saveJSON(PEERKEY_STORAGE(toUser), pub_key);
        const peerPub = sodium.from_base64(pub_key, B64.current);
        deriveSessionKey(peerPub);
        if (!sentFlag.current) {
          sio.emit("exchange_keys", {
            to:      toUser,
            pub_key: sodium.to_base64(myKeyPair.current.publicKey, B64.current)
          });
          sentFlag.current = true;
          logMsg(`🔁 Re‐sent pubkey to ${toUser}`);
          setTimeout(() => sentFlag.current = false, 1000);
        }
      };

      // on live encrypted message: decrypt + append
      const onSecure = (d) => {
        logMsg(`📥 Live packet: ${JSON.stringify(d)}`);
        if (!sessionKey.current || d.from !== toUser || d.seq <= recvSeq) {
          logMsg("⛔ Dropped live (not ready/old/wrong)");
          return;
        }
        try {
          const pt = sodium.to_string(
            sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
              null,
              sodium.from_base64(d.ciphertext, B64.current),
              d.seq.toString(),
              sodium.from_base64(d.nonce,      B64.current),
              sessionKey.current
            )
          );
          const ts = new Date().toLocaleTimeString();
          setRecvSeq(d.seq);
          setMessages(ms => [
            ...ms,
            { seq: d.seq, user: d.from, text: pt, type: "received", timestamp: ts }
          ]);
          logMsg(`💬 Decrypted live: ${pt}`);
        } catch (e) {
          logMsg(`❌ Live decrypt failed: ${e}`);
        }
      };

      sio.on("connect",             onConnect);
      sio.on("peer_key",            onPeerKey);
      sio.on("secure_message_client", onSecure);
      sio.on("connect_error",       e => logMsg(`❌ Socket error: ${e}`));
    });

    return () => {
      cancelled = true;
      const s = socketRef.current;
      if (s) { s.off(); s.disconnect(); socketRef.current = null; }
    };
  }, [toUser, convId, deriveSessionKey]);

  // once 🔒 ready, load all historical messages in order
  useEffect(() => {
    if (!ready) return;

    fetch(`http://localhost:5000/api/conversations/${convId}/messages`, {
      credentials: "include"
    })
    .then(r => r.json())
    .then(history => {
      const out = [];
      for (const pkt of history) {
        try {
          const pt = sodium.to_string(
            sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
              null,
              sodium.from_base64(pkt.ciphertext, B64.current),
              pkt.seq.toString(),
              sodium.from_base64(pkt.nonce,      B64.current),
              sessionKey.current
            )
          );
          out.push({
            seq:       pkt.seq,
            user:      pkt.from,
            text:      pt,
            type:      pkt.from === currentUser ? "sent" : "received",
            timestamp: pkt.timestamp    // ISO‐string from your API
          });
        } catch (e) {
          logMsg(`❌ History decrypt seq=${pkt.seq}: ${e}`);
        }
      }
      // sort by timestamp
      out.sort((a,b) =>
        new Date(a.timestamp) - new Date(b.timestamp)
      );
      setMessages(out);
      if (out.length) setRecvSeq(out[out.length-1].seq);
    })
    .catch(e => logMsg(`❌ History load err: ${e}`));
  }, [ready, convId, currentUser]);

  // ─── send encrypted ─────────────────────────────────────
  const sendMsg = () => {
    if (!input.trim() || !sessionKey.current) {
      logMsg("⛔ Can't send—no key or blank");
      return;
    }
    const iv = sodium.randombytes_buf(
      sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    );
    const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      input,
      sendSeq.toString(),
      null,
      iv,
      sessionKey.current
    );
    const ts = new Date().toLocaleTimeString();
    socketRef.current.emit("secure_message", {
      to:         toUser,
      conv_id:    convId,
      seq:        sendSeq,
      nonce:      sodium.to_base64(iv,  B64.current),
      ciphertext: sodium.to_base64(ct, B64.current)
    });
    setMessages(ms => [
      ...ms,
      { seq: sendSeq, user: currentUser, text: input, type: "sent", timestamp: ts }
    ]);
    setInput("");
    setSendSeq(s => s + 1);
    logMsg(`➡️ Sent seq=${sendSeq}`);
  };

  return (
   <div className="chat-container">
      <div className="chat-header">Chat with {toUser}</div>

      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.type}`}>
            <div className="text">{m.text}</div>
            <div className="timestamp">{m.timestamp}</div>
          </div>
        ))}
      </div>

      <div className="chat-input-container">
        <input
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendMsg()}
          placeholder={ready ? "Type a message…" : "Securing…"}
          disabled={!ready}
        />
        <button
          className="send-button"
          onClick={sendMsg}
          disabled={!ready || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
