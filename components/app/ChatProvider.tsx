import {
  chatReply,
  demoFamily,
  generalChatChips,
  genericAheadChips,
  genericAheadOpener,
  type Chip,
} from '@/lib/demo-data';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type ChatMsg = {
  from: 'taylo' | 'user';
  text: string;
  emailCard?: boolean;
  emailState?: 'open' | 'added' | 'skipped';
};

export type Conversation = {
  id: string;
  icon: string;
  title: string;
  sub: string;
  messages: ChatMsg[];
  chips: Chip[];
  kind: 'general' | 'item';
  updatedAt: number;
};

type OpenItemOpts = {
  icon: string;
  title: string;
  sub: string;
  opener: string;
  chips?: Chip[];
  emailCard?: boolean;
};

type ChatCtx = {
  conversations: Conversation[];
  current: Conversation | null;
  typing: boolean;
  openGeneral: () => void;
  openItem: (id: string, opts: OpenItemOpts) => void;
  selectConversation: (id: string) => void;
  send: (text: string) => void;
  setEmailState: (state: 'added' | 'skipped') => void;
};

const ChatContext = createContext<ChatCtx | null>(null);

function greetings() {
  return ["Hi! What's on your mind?", 'Hey — how can I help today?'];
}

function makeGeneral(): Conversation {
  const greet = greetings()[Math.floor(Math.random() * greetings().length)];
  return {
    id: `general-${Date.now()}`,
    icon: 'T',
    title: 'Taylo',
    sub: 'New chat',
    messages: [{ from: 'taylo', text: greet }],
    chips: generalChatChips,
    kind: 'general',
    updatedAt: Date.now(),
  };
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const seed = useRef<Conversation | null>(null);
  if (!seed.current) seed.current = makeGeneral();
  const [conversations, setConversations] = useState<Conversation[]>([seed.current]);
  const [currentId, setCurrentId] = useState<string | null>(seed.current.id);
  const currentIdRef = useRef<string | null>(seed.current.id);
  const [typing, setTyping] = useState(false);

  function setCurrent(id: string) {
    currentIdRef.current = id;
    setCurrentId(id);
  }

  const current = useMemo(
    () => conversations.find((c) => c.id === currentId) ?? null,
    [conversations, currentId],
  );

  const openGeneral = useCallback(() => {
    const greet = greetings()[Math.floor(Math.random() * greetings().length)];
    const conv: Conversation = {
      id: `general-${Date.now()}`,
      icon: 'T',
      title: 'Taylo',
      sub: 'New chat',
      messages: [{ from: 'taylo', text: greet }],
      chips: generalChatChips,
      kind: 'general',
      updatedAt: Date.now(),
    };
    setConversations((prev) => [...prev, conv]);
    setCurrent(conv.id);
  }, []);

  const openItem = useCallback((id: string, opts: OpenItemOpts) => {
    setConversations((prev) => {
      const existing = prev.find((c) => c.id === id);
      if (existing) {
        setCurrent(id);
        return prev.map((c) => (c.id === id ? { ...c, updatedAt: Date.now() } : c));
      }
      const conv: Conversation = {
        id,
        icon: opts.icon,
        title: opts.title,
        sub: opts.sub,
        messages: [
          {
            from: 'taylo',
            text: opts.opener || genericAheadOpener(opts.title, opts.sub),
            emailCard: opts.emailCard,
            emailState: opts.emailCard ? 'open' : undefined,
          },
        ],
        chips: opts.chips?.length ? opts.chips : genericAheadChips,
        kind: 'item',
        updatedAt: Date.now(),
      };
      setCurrent(id);
      return [...prev, conv];
    });
  }, []);

  const selectConversation = useCallback((id: string) => {
    setCurrent(id);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, updatedAt: Date.now() } : c)));
  }, []);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      const id = currentIdRef.current;
      if (!trimmed || !id) return;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, messages: [...c.messages, { from: 'user', text: trimmed }], updatedAt: Date.now() }
            : c,
        ),
      );
      setTyping(true);
      setTimeout(() => {
        const reply = chatReply(trimmed);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, messages: [...c.messages, { from: 'taylo', text: reply }], updatedAt: Date.now() }
              : c,
          ),
        );
        setTyping(false);
      }, 1100);
    },
    [],
  );

  const setEmailState = useCallback(
    (state: 'added' | 'skipped') => {
      const id = currentIdRef.current;
      if (!id) return;
      const follow =
        state === 'added'
          ? `Done! ${demoFamily.kids[1].name}'s check-up is in the calendar. I'll remind you the day before 💙`
          : undefined;
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          const messages = c.messages.map((m) =>
            m.emailCard && m.emailState === 'open' ? { ...m, emailState: state } : m,
          );
          return { ...c, messages, updatedAt: Date.now() };
        }),
      );
      if (follow) {
        setTimeout(() => {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === id
                ? { ...c, messages: [...c.messages, { from: 'taylo', text: follow }], updatedAt: Date.now() }
                : c,
            ),
          );
        }, 300);
      }
    },
    [],
  );

  const value = useMemo(
    () => ({ conversations, current, typing, openGeneral, openItem, selectConversation, send, setEmailState }),
    [conversations, current, typing, openGeneral, openItem, selectConversation, send, setEmailState],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
