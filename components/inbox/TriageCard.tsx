"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Reply,
  Bot,
  Clock,
  Check,
  ChevronDown,
  ChevronUp,
  Volume2,
  Square,
  Settings2,
} from "lucide-react";
import type { InboxItem } from "@/app/generated/prisma/client";
import { getVoicesAsync, resolvePreferredVoice, saveVoiceURI, stripUrlsForSpeech } from "@/lib/voice";
import { ClientText } from "@/components/ClientText";
import { SNOOZE_PRESET_OPTIONS } from "@/lib/snoozePresets";

type Mode = "idle" | "reply" | "delegate" | "snooze";

export function TriageCard({ item }: { item: InboxItem }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [fullBody, setFullBody] = useState<string | null>(null);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [showFullBody, setShowFullBody] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>("");

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [item.id]);

  async function openVoicePicker() {
    const opening = !showVoicePicker;
    setShowVoicePicker(opening);
    if (opening && voices.length === 0) {
      const list = await getVoicesAsync();
      setVoices(list);
      const preferred = resolvePreferredVoice(list);
      if (preferred) setSelectedVoiceURI(preferred.voiceURI);
    }
  }

  function speakText(text: string, voice?: SpeechSynthesisVoice | null) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSpeechError("Speech isn't supported in this browser.");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) utterance.voice = voice;
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => {
      setIsSpeaking(false);
      setSpeechError("Playback stopped unexpectedly.");
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  }

  function previewVoice() {
    const voice = voices.find((v) => v.voiceURI === selectedVoiceURI) ?? null;
    speakText(
      "This is what I sound like. Let me know if this is the voice you'd like to keep.",
      voice,
    );
  }

  function handleVoiceChange(uri: string) {
    setSelectedVoiceURI(uri);
    saveVoiceURI(uri);
  }

  // Fetches once and caches — shared by the "view full email" toggle and
  // the "listen" button so neither re-fetches what the other already has.
  async function loadFullBody(): Promise<string | null> {
    if (fullBody !== null) return fullBody;
    setBodyLoading(true);
    setBodyError(null);
    const res = await fetch(`/api/inbox/${item.id}/body`);
    setBodyLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message = data.error || "Failed to load the full email.";
      setBodyError(message);
      return null;
    }
    const data = await res.json();
    const body = data.body || "(empty message)";
    setFullBody(body);
    return body;
  }

  async function toggleFullBody() {
    if (showFullBody) {
      setShowFullBody(false);
      return;
    }
    setShowFullBody(true);
    await loadFullBody();
  }

  async function toggleSpeech() {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSpeechError("Speech isn't supported in this browser.");
      return;
    }

    setSpeechError(null);
    const body = await loadFullBody();
    if (body === null) return;

    let voiceList = voices;
    if (voiceList.length === 0) {
      voiceList = await getVoicesAsync();
      setVoices(voiceList);
    }
    const preferred = resolvePreferredVoice(voiceList);
    if (preferred) setSelectedVoiceURI(preferred.voiceURI);

    const text = stripUrlsForSpeech(`Email from ${item.sender}. Subject: ${item.subject}. ${body}`);
    speakText(text, preferred);
  }

  async function submit(path: string, body: unknown) {
    setError(null);
    const res = await fetch(`/api/inbox/${item.id}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong.");
      return;
    }
    setMode("idle");
    setText("");
    startTransition(() => router.refresh());
  }

  const busy = isPending;

  return (
    <div className="rounded-xl border border-border bg-panel p-4 md:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-base font-medium text-text truncate">
            {item.sender}
          </div>
          <div className="font-data text-xs text-text-faint truncate">{item.senderEmail}</div>
        </div>
        <span className="shrink-0 font-data text-[11px] text-text-faint">
          <ClientText
            compute={() =>
              new Date(item.receivedAt).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            }
            fallback={item.receivedAt.toISOString()}
          />
        </span>
      </div>

      <div className="mt-3 text-sm font-medium text-text">{item.subject}</div>
      <p className="mt-1 text-sm text-text-muted">{item.preview}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          onClick={toggleFullBody}
          className="flex min-h-9 items-center gap-1.5 text-xs text-text-faint hover:text-text"
        >
          {showFullBody ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {showFullBody ? "Hide full email" : "View full email"}
        </button>
        <button
          onClick={toggleSpeech}
          className={`flex min-h-9 items-center gap-1.5 text-xs hover:text-text ${
            isSpeaking ? "text-accent" : "text-text-faint"
          }`}
        >
          {isSpeaking ? <Square size={13} /> : <Volume2 size={13} />}
          {isSpeaking ? "Stop" : "Listen"}
        </button>
        <button
          onClick={openVoicePicker}
          aria-label="Choose voice"
          className="flex h-9 w-9 items-center justify-center text-text-faint hover:text-text"
        >
          <Settings2 size={13} />
        </button>
      </div>

      {showVoicePicker && (
        <div className="mt-1 flex flex-col gap-2 rounded-md border border-border-strong bg-panel-raised p-3 sm:flex-row sm:items-center">
          <select
            value={selectedVoiceURI}
            onChange={(e) => handleVoiceChange(e.target.value)}
            className="min-h-10 flex-1 rounded-md border border-border-strong bg-panel px-2 text-sm text-text focus:border-accent focus:outline-none"
          >
            {voices.length === 0 && <option value="">No voices found</option>}
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
          <button
            onClick={previewVoice}
            disabled={!selectedVoiceURI}
            className="min-h-10 shrink-0 rounded-md border border-border-strong px-3 text-sm text-text hover:border-accent disabled:opacity-50"
          >
            Preview
          </button>
        </div>
      )}

      {speechError && <div className="mt-1 text-xs text-status-critical">{speechError}</div>}

      {showFullBody && (
        <div className="mt-1 max-h-72 overflow-y-auto rounded-md border border-border-strong bg-panel-raised p-3">
          {bodyLoading && <span className="text-xs text-text-faint">Loading…</span>}
          {bodyError && <span className="text-xs text-status-critical">{bodyError}</span>}
          {!bodyLoading && !bodyError && fullBody && (
            <p className="whitespace-pre-wrap text-sm text-text">{fullBody}</p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-status-critical/40 bg-status-critical-dim px-3 py-2 text-xs text-status-critical">
          {error}
        </div>
      )}

      {mode === "idle" && (
        <div className="mt-4 grid grid-cols-2 gap-2 md:flex md:flex-wrap">
          <ActionButton icon={Reply} label="Reply" onClick={() => setMode("reply")} />
          <ActionButton icon={Bot} label="Delegate" onClick={() => setMode("delegate")} />
          <ActionButton icon={Clock} label="Snooze" onClick={() => setMode("snooze")} />
          <ActionButton
            icon={Check}
            label="Done"
            accent
            disabled={busy}
            onClick={() => submit("done", {})}
          />
        </div>
      )}

      {mode === "reply" && (
        <div className="mt-4 flex flex-col gap-2">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Draft reply — saved to Outlook drafts, you send it from there."
            rows={5}
            className="min-h-28 w-full resize-y rounded-md border border-border-strong bg-panel-raised px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              disabled={busy || !text.trim()}
              onClick={() => submit("reply", { body: text })}
              className="min-h-11 flex-1 rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
            >
              Save draft
            </button>
            <CancelButton onClick={() => setMode("idle")} />
          </div>
        </div>
      )}

      {mode === "delegate" && (
        <div className="mt-4 flex flex-col gap-2">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What should the agent do with this?"
            rows={3}
            className="min-h-20 w-full resize-y rounded-md border border-border-strong bg-panel-raised px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              disabled={busy || !text.trim()}
              onClick={() => submit("delegate", { note: text })}
              className="min-h-11 flex-1 rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
            >
              Delegate
            </button>
            <CancelButton onClick={() => setMode("idle")} />
          </div>
        </div>
      )}

      {mode === "snooze" && (
        <div className="mt-4 flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {SNOOZE_PRESET_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                disabled={busy}
                onClick={() => submit("snooze", { preset: opt.key })}
                className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 text-sm text-text hover:border-accent disabled:opacity-50"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <CancelButton onClick={() => setMode("idle")} />
        </div>
      )}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  accent,
  disabled,
}: {
  icon: typeof Reply;
  label: string;
  onClick: () => void;
  accent?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-50 ${
        accent
          ? "border-accent bg-accent text-bg hover:bg-accent-strong"
          : "border-border-strong bg-panel-raised text-text hover:border-accent"
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="min-h-11 rounded-md border border-border-strong px-4 text-sm text-text-muted hover:text-text"
    >
      Cancel
    </button>
  );
}
