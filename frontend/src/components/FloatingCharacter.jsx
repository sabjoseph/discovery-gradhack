import { useEffect, useRef, useState } from "react";
import { useCustomer } from "../context/CustomerContext";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import "./FloatingCharacter.css";

const LEAF_SRC = "/assets/bitebetter-leaf.png";
const FALLBACK_REPLY =
  "Hmm, having trouble thinking right now — try again in a sec 🍃";
const HINT_DELAY_MS = 1500;

export { LEAF_SRC };

export function openLeafyChat() {
  window.dispatchEvent(new CustomEvent("leafy:open-chat"));
}

function LeafAvatar({ className = "", thinking = false, ...props }) {
  return (
    <div
      className={`bb-char ${thinking ? "is-thinking" : ""} ${className}`.trim()}
      {...props}
    >
      <img src={LEAF_SRC} alt="" />
    </div>
  );
}

async function readInvokeErrorBody(error) {
  if (!error?.context || typeof error.context.json !== "function") return null;
  try {
    return await error.context.json();
  } catch {
    return null;
  }
}

function isEdgeFunctionMissing(body, error) {
  return (
    body?.code === "NOT_FOUND" ||
    body?.message?.includes("Requested function was not found") ||
    error?.message?.includes("Failed to send a request to the Edge Function")
  );
}

async function invokeChatAssistant(payload) {
  if (supabase) {
    const { data, error } = await supabase.functions.invoke("chat-assistant", {
      body: payload,
    });

    if (!error && data?.reply) {
      return data;
    }

    const body = error ? await readInvokeErrorBody(error) : null;

    if (error && !isEdgeFunctionMissing(body, error)) {
      if (import.meta.env.DEV) {
        console.error("[FloatingCharacter] edge function failed:", {
          name: error.name,
          message: error.message,
          body,
        });
      }
      throw new Error(body?.error || error.message);
    }

    if (import.meta.env.DEV) {
      console.warn(
        "[FloatingCharacter] chat-assistant edge function unavailable; using backend fallback."
      );
    }
  }

  const result = await api.chatAssistant(payload);
  if (result?.error) {
    throw new Error(String(result.error));
  }
  return result;
}

export default function FloatingCharacter() {
  const { customerId, sessionToken } = useCustomer();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [hasOpenedChat, setHasOpenedChat] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (import.meta.env.DEV && customerId) {
      console.debug("[FloatingCharacter] customerId:", customerId, "hasToken:", Boolean(sessionToken));
    }
  }, [customerId, sessionToken]);

  useEffect(() => {
    function handleOpenRequest() {
      setHasOpenedChat(true);
      setShowHint(false);
      setOpen(true);
    }

    window.addEventListener("leafy:open-chat", handleOpenRequest);
    return () => window.removeEventListener("leafy:open-chat", handleOpenRequest);
  }, []);

  useEffect(() => {
    if (hasOpenedChat || open) {
      setShowHint(false);
      return undefined;
    }

    const timer = window.setTimeout(() => setShowHint(true), HINT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hasOpenedChat, open]);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open, thinking]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  function openChat() {
    setHasOpenedChat(true);
    setShowHint(false);
    setOpen(true);
  }

  function dismissHint() {
    setShowHint(false);
  }

  function closeChat() {
    if (thinking) return;
    setOpen(false);
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = input.trim();
    if (!text || thinking || !customerId || !sessionToken) return;

    const userMessage = { role: "user", content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setThinking(true);

    const payload = {
      customerId: String(customerId),
      token: sessionToken,
      message: text,
      conversationHistory: nextMessages.slice(-10, -1).map(({ role, content }) => ({
        role,
        content,
      })),
    };

    try {
      const data = await invokeChatAssistant(payload);
      const reply =
        typeof data?.reply === "string" && data.reply.trim()
          ? data.reply.trim()
          : FALLBACK_REPLY;

      setMessages((current) => [
        ...current,
        { role: "assistant", content: reply },
      ]);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[FloatingCharacter] chat failed:", err);
      }
      setMessages((current) => [
        ...current,
        { role: "assistant", content: FALLBACK_REPLY },
      ]);
    } finally {
      setThinking(false);
    }
  }

  if (!customerId || !sessionToken) return null;

  return (
    <>
      {!open && (
        <div
          className="bb-float"
          onMouseEnter={dismissHint}
        >
          {showHint && (
            <div className="bb-hint-bubble" role="status" aria-live="polite">
              Press me to chat!
            </div>
          )}
          <button
            type="button"
            className={`bb-char bb-char-float ${thinking ? "is-thinking" : ""}`}
            onClick={openChat}
            aria-label="Open BiteBetter assistant"
          >
            <img src={LEAF_SRC} alt="" />
          </button>
        </div>
      )}

      {open && (
        <>
          <div
            className="bb-chat-backdrop"
            onClick={closeChat}
            aria-hidden="true"
          />
          <section
            className="bb-chat-panel"
            aria-label="BiteBetter assistant chat"
          >
            <header className="bb-chat-head">
              <LeafAvatar thinking={thinking} aria-hidden="true" />
              <div className="bb-chat-head-text">
                <strong>Leafy</strong>
                <small>Your BiteBetter pantry pal</small>
              </div>
              <button
                type="button"
                className="bb-chat-close"
                onClick={closeChat}
                disabled={thinking}
                aria-label="Close chat"
              >
                ×
              </button>
            </header>

            <div className="bb-chat-messages" ref={listRef}>
              {messages.length === 0 && !thinking && (
                <p className="bb-chat-empty">
                  Hi! Ask me about your pantry, recipes, or recent shops — I only
                  know what&apos;s in your BiteBetter data.
                </p>
              )}
              {messages.map((msg, index) => (
                <div
                  key={`${msg.role}-${index}`}
                  className={`bb-msg ${
                    msg.role === "user" ? "bb-msg-user" : "bb-msg-assistant"
                  }`}
                >
                  {msg.content}
                </div>
              ))}
              {thinking && (
                <div className="bb-msg bb-msg-assistant">Thinking…</div>
              )}
            </div>

            <form className="bb-chat-form" onSubmit={sendMessage}>
              <input
                ref={inputRef}
                type="text"
                className="bb-chat-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about your pantry or recipes…"
                disabled={thinking}
                maxLength={500}
                aria-label="Chat message"
              />
              <button
                type="submit"
                className="bb-chat-send"
                disabled={thinking || !input.trim()}
              >
                Send
              </button>
            </form>
          </section>
        </>
      )}
    </>
  );
}
