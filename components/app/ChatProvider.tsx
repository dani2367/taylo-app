import { genericAheadOpener, type Chip } from '@/lib/demo-data';
import { refreshSpotlight } from '@/lib/spotlight';
import { supabase } from '@/lib/supabase';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export type ChatMsg = {
  id?: string;
  from: 'taylo' | 'user';
  text: string;
  emailCard?: boolean;
  emailState?: 'open' | 'added' | 'skipped';
};

export type AskIntent = 'ask' | 'offload';

export type Conversation = {
  id: string;
  icon: string;
  title: string;
  sub: string;
  messages: ChatMsg[];
  chips: Chip[];
  kind: 'general' | 'item';
  intent: AskIntent | null;
  relatedItemId?: string | null;
  updatedAt: number;
};

type OpenItemOpts = {
  icon: string;
  title: string;
  sub: string;
  opener: string;
  chips?: Chip[];
  emailCard?: boolean;
  generateOpener?: boolean;
};

type ChatCtx = {
  conversations: Conversation[];
  current: Conversation | null;
  typing: boolean;
  openGeneral: () => Promise<void>;
  openItem: (id: string, opts: OpenItemOpts) => Promise<void>;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  chooseIntent: (intent: AskIntent) => void;
  send: (text: string) => void;
  setEmailState: (state: 'added' | 'skipped') => void;
};

type ConversationRow = {
  id: string;
  kind: 'general' | 'item';
  related_item_id: string | null;
  icon: string | null;
  title: string | null;
  subtitle: string | null;
  suggestion_chips: Chip[] | null;
  intent: AskIntent | null;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender: 'user' | 'taylo' | 'sys';
  body: string;
  has_email_card: boolean | null;
  created_at: string;
};

const ChatContext = createContext<ChatCtx | null>(null);

const ASK_GREET = "Hi! What's on your mind?";

const CONV_SELECT =
  'id, kind, related_item_id, icon, title, subtitle, suggestion_chips, intent, updated_at';

const GENERIC_CHIP_LABELS = new Set([
  'What else this week?',
  'Sports day kit',
  'Dinner ideas',
  'Clubs brochure?',
  "What's the plan?",
  'Remind me nearer the time',
]);

function parseChips(raw: Chip[] | null | undefined): Chip[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.filter((c) => c?.label && c?.msg && !GENERIC_CHIP_LABELS.has(c.label));
}

function parseIntent(raw: string | null | undefined): AskIntent | null {
  return raw === 'ask' || raw === 'offload' ? raw : null;
}

function isPlaceholderTitle(title: string, sub: string) {
  const t = title.trim().toLowerCase();
  const s = sub.trim().toLowerCase();
  return (
    t === 'taylo' ||
    t === 'new chat' ||
    s === 'new chat' ||
    s === 'offload' ||
    s === 'offload or ask'
  );
}

function conversationTitleFromText(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ').filter(Boolean).slice(0, 6);
  let title = words.join(' ');
  if (title.length > 36) title = `${title.slice(0, 34).trim()}…`;
  if (!title) return 'Chat';
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function mapMessages(rows: MessageRow[], conversationId: string): ChatMsg[] {
  return rows
    .filter((row) => row.conversation_id === conversationId)
    .map((row) => ({
      id: row.id,
      from: row.sender === 'user' ? 'user' : 'taylo',
      text: row.body,
      emailCard: !!row.has_email_card,
      emailState: row.has_email_card ? 'open' : undefined,
    }));
}

function mapConversation(row: ConversationRow, messages: ChatMsg[]): Conversation {
  const kind = row.kind === 'item' ? 'item' : 'general';
  return {
    id: row.id,
    icon: row.icon || 'T',
    title: row.title || 'Taylo',
    sub: row.subtitle || (kind === 'general' ? 'New chat' : ''),
    messages,
    chips: parseChips(row.suggestion_chips),
    kind,
    intent: parseIntent(row.intent),
    relatedItemId: row.related_item_id,
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

async function requireUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function invokeTayloFunction(
  name: 'taylo-chat' | 'taylo-offload',
  body: Record<string, unknown>,
): Promise<{ reply: string; title?: string; message_id?: string; chips?: Chip[] }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token || !supabaseUrl || !supabaseAnonKey) {
    throw new Error('Not signed in');
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = (await res.json()) as {
    reply?: string;
    title?: string;
    message_id?: string;
    chips?: Chip[];
    error?: string;
  };
  if (!res.ok || !payload.reply) {
    throw new Error(payload.error || 'Taylo could not reply');
  }
  return {
    reply: payload.reply,
    title: payload.title,
    message_id: payload.message_id,
    chips: parseChips(payload.chips),
  };
}

async function fetchTayloReply(
  conversationId: string,
  opts?: { opener?: boolean },
): Promise<{ reply: string; title?: string; message_id?: string; chips?: Chip[] }> {
  return invokeTayloFunction('taylo-chat', {
    conversation_id: conversationId,
    ...(opts?.opener ? { opener: true } : {}),
  });
}

async function fetchOffloadReply(
  conversationId: string,
): Promise<{ reply: string; title?: string; message_id?: string }> {
  return invokeTayloFunction('taylo-offload', { conversation_id: conversationId });
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const currentIdRef = useRef<string | null>(null);
  const [typing, setTyping] = useState(false);
  const intentRef = useRef<AskIntent | null>(null);

  function setCurrent(id: string | null) {
    currentIdRef.current = id;
    setCurrentId(id);
  }

  const current = useMemo(
    () => conversations.find((c) => c.id === currentId) ?? null,
    [conversations, currentId],
  );
  intentRef.current = current?.intent ?? null;

  const loadConversations = useCallback(async () => {
    const userId = await requireUserId();
    if (!userId) {
      setConversations([]);
      setCurrent(null);
      return;
    }

    const { data: convRows, error: convError } = await supabase
      .from('conversations')
      .select(CONV_SELECT)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (convError) {
      console.error('Failed to load conversations:', convError.message);
      return;
    }

    const ids = (convRows ?? []).map((row) => row.id);
    let messageRows: MessageRow[] = [];
    if (ids.length > 0) {
      const { data, error: msgError } = await supabase
        .from('messages')
        .select('id, conversation_id, sender, body, has_email_card, created_at')
        .eq('user_id', userId)
        .in('conversation_id', ids)
        .order('created_at', { ascending: true });
      if (msgError) {
        console.error('Failed to load messages:', msgError.message);
        return;
      }
      messageRows = (data ?? []) as MessageRow[];
    }

    const mapped = ((convRows ?? []) as ConversationRow[]).map((row) =>
      mapConversation(row, mapMessages(messageRows, row.id)),
    );
    setConversations(mapped);
    const keep = currentIdRef.current && mapped.some((c) => c.id === currentIdRef.current)
      ? currentIdRef.current
      : mapped[0]?.id ?? null;
    setCurrent(keep);
  }, []);

  useEffect(() => {
    void loadConversations();
    const { data } = supabase.auth.onAuthStateChange(() => {
      void loadConversations();
    });
    return () => data.subscription.unsubscribe();
  }, [loadConversations]);

  const openGeneral = useCallback(async () => {
    const userId = await requireUserId();
    if (!userId) return;

    const now = new Date().toISOString();
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .insert({
        user_id: userId,
        kind: 'general',
        related_item_id: null,
        icon: 'T',
        title: 'Taylo',
        subtitle: null,
        suggestion_chips: [],
        intent: null,
        updated_at: now,
      })
      .select(CONV_SELECT)
      .single();

    if (convError || !conv) {
      console.error('Failed to start chat:', convError?.message);
      return;
    }

    const mapped = mapConversation(conv as ConversationRow, []);
    setConversations((prev) => [mapped, ...prev.filter((c) => c.id !== mapped.id)]);
    setCurrent(mapped.id);
  }, []);

  const openItem = useCallback(async (id: string, opts: OpenItemOpts) => {
    const userId = await requireUserId();
    if (!userId) return;

    const opener = opts.opener || genericAheadOpener(opts.title, opts.sub);
    const chips = opts.chips ?? [];

    function showThread(row: ConversationRow, messages: ChatMsg[]) {
      const mapped = mapConversation(row, messages);
      setConversations((prev) => [mapped, ...prev.filter((c) => c.id !== mapped.id)]);
      setCurrent(mapped.id);
    }

    function fillOpenerInBackground(conversationId: string) {
      void (async () => {
        setTyping(true);
        try {
          try {
            const result = await fetchTayloReply(conversationId, { opener: true });
            setConversations((prev) =>
              prev.map((c) =>
                c.id === conversationId && result.chips
                  ? { ...c, chips: result.chips, updatedAt: Date.now() }
                  : c,
              ),
            );
          } catch (err) {
            console.error(err);
          }
          let { data: msgs } = await supabase
            .from('messages')
            .select('id, conversation_id, sender, body, has_email_card, created_at')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });
          if (!(msgs ?? []).length) {
            await supabase.from('messages').insert({
              conversation_id: conversationId,
              user_id: userId,
              sender: 'taylo',
              body: opener,
              has_email_card: !!opts.emailCard,
            });
            const retry = await supabase
              .from('messages')
              .select('id, conversation_id, sender, body, has_email_card, created_at')
              .eq('conversation_id', conversationId)
              .order('created_at', { ascending: true });
            msgs = retry.data;
          }
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversationId
                ? {
                    ...c,
                    messages: mapMessages((msgs ?? []) as MessageRow[], conversationId),
                    updatedAt: Date.now(),
                  }
                : c,
            ),
          );
        } finally {
          setTyping(false);
        }
      })();
    }

    const { data: existing } = await supabase
      .from('conversations')
      .select(CONV_SELECT)
      .eq('user_id', userId)
      .eq('kind', 'item')
      .eq('related_item_id', id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('id, conversation_id, sender, body, has_email_card, created_at')
        .eq('conversation_id', existing.id)
        .order('created_at', { ascending: true });
      const rows = (msgs ?? []) as MessageRow[];
      showThread(existing as ConversationRow, mapMessages(rows, existing.id));
      void supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (opts.generateOpener && rows.length === 0) {
        fillOpenerInBackground(existing.id);
      }
      return;
    }

    const now = new Date().toISOString();
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .insert({
        user_id: userId,
        kind: 'item',
        related_item_id: id,
        icon: opts.icon,
        title: opts.title,
        subtitle: opts.sub,
        suggestion_chips: chips,
        updated_at: now,
      })
      .select(CONV_SELECT)
      .single();

    if (convError || !conv) {
      console.error('Failed to start item chat:', convError?.message);
      return;
    }

    if (opts.generateOpener) {
      showThread(conv as ConversationRow, []);
      fillOpenerInBackground(conv.id);
      return;
    }

    const { data: inserted } = await supabase
      .from('messages')
      .insert({
        conversation_id: conv.id,
        user_id: userId,
        sender: 'taylo',
        body: opener,
        has_email_card: !!opts.emailCard,
      })
      .select('id, conversation_id, sender, body, has_email_card, created_at')
      .single();

    showThread(
      conv as ConversationRow,
      inserted
        ? mapMessages([inserted as MessageRow], conv.id)
        : [
            {
              from: 'taylo',
              text: opener,
              emailCard: !!opts.emailCard,
              emailState: opts.emailCard ? 'open' : undefined,
            },
          ],
    );
  }, []);

  const selectConversation = useCallback((id: string) => {
    setCurrent(id);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, updatedAt: Date.now() } : c)),
    );
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    const { error } = await supabase.from('conversations').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete conversation:', error.message);
      return;
    }
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (currentIdRef.current === id) {
        setCurrent(next[0]?.id ?? null);
      }
      return next;
    });
  }, []);

  const chooseIntent = useCallback((intent: AskIntent) => {
    const id = currentIdRef.current;
    if (!id) return;

    void (async () => {
      const userId = await requireUserId();
      if (!userId) return;

      const subtitle = intent === 'offload' ? 'Offload' : 'New chat';
      intentRef.current = intent;
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, intent, sub: subtitle, updatedAt: Date.now() } : c)),
      );
      await supabase
        .from('conversations')
        .update({ intent, subtitle, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (intent !== 'ask') return;

      const { data: msg } = await supabase
        .from('messages')
        .insert({
          conversation_id: id,
          user_id: userId,
          sender: 'taylo',
          body: ASK_GREET,
          has_email_card: false,
        })
        .select('id, conversation_id, sender, body, has_email_card, created_at')
        .single();

      if (!msg) return;
      const added = mapMessages([msg as MessageRow], id)[0];
      setConversations((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, messages: [...c.messages, added], updatedAt: Date.now() } : c,
        ),
      );
    })();
  }, []);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    const id = currentIdRef.current;
    if (!trimmed || !id) return;

    void (async () => {
      const userId = await requireUserId();
      if (!userId) return;
      const offload = intentRef.current === 'offload';

      const { data: inserted, error: insertError } = await supabase
        .from('messages')
        .insert({
          conversation_id: id,
          user_id: userId,
          sender: 'user',
          body: trimmed,
          has_email_card: false,
        })
        .select('id, body, created_at')
        .single();

      if (insertError || !inserted) {
        console.error('Failed to send message:', insertError?.message);
        return;
      }

      const userMsg: ChatMsg = { id: inserted.id, from: 'user', text: trimmed };
      let namedTitle: string | undefined;
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === id);
        if (existing && isPlaceholderTitle(existing.title, existing.sub)) {
          namedTitle = conversationTitleFromText(trimmed);
        }
        return prev.map((c) =>
          c.id === id
            ? {
                ...c,
                title: namedTitle ?? c.title,
                sub: namedTitle ? 'Taylo' : c.sub,
                messages: [...c.messages, userMsg],
                updatedAt: Date.now(),
              }
            : c,
        );
      });
      await supabase
        .from('conversations')
        .update({
          updated_at: new Date().toISOString(),
          ...(namedTitle ? { title: namedTitle, subtitle: 'Taylo' } : {}),
        })
        .eq('id', id);

      setTyping(true);
      try {
        const { reply, title } = offload ? await fetchOffloadReply(id) : await fetchTayloReply(id);
        if (offload) void refreshSpotlight({ force: true });
        setConversations((prev) =>
          prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  title: title || c.title,
                  sub: title ? 'Taylo' : c.sub,
                  messages: [...c.messages, { from: 'taylo', text: reply }],
                  updatedAt: Date.now(),
                }
              : c,
          ),
        );
      } catch (err) {
        console.error(err);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  messages: [
                    ...c.messages,
                    { from: 'taylo', text: "Sorry — I couldn't get through just then. Try sending that again?" },
                  ],
                  updatedAt: Date.now(),
                }
              : c,
          ),
        );
      } finally {
        setTyping(false);
      }
    })();
  }, []);

  const setEmailState = useCallback((state: 'added' | 'skipped') => {
    const id = currentIdRef.current;
    if (!id) return;
    const follow =
      state === 'added'
        ? "Done — I'll keep that in mind. (Calendar write-up isn't live yet.)"
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
  }, []);

  const value = useMemo(
    () => ({
      conversations,
      current,
      typing,
      openGeneral,
      openItem,
      selectConversation,
      deleteConversation,
      chooseIntent,
      send,
      setEmailState,
    }),
    [conversations, current, typing, openGeneral, openItem, selectConversation, deleteConversation, chooseIntent, send, setEmailState],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
