import { appStyles as s } from '@/components/app/styles';
import { emailBodyParagraphs, orderSourceEmails, splitEmailChain, type EmailChainMessage } from '@/lib/source-email';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

export type SourceEmailMessage = {
  id: string;
  sender: string | null;
  subject: string | null;
  body_text: string | null;
  received_at: string | null;
  created_at: string | null;
};

export async function loadSourceEmails(itemId: string): Promise<SourceEmailMessage[]> {
  const { data, error } = await supabase
    .from('source_emails')
    .select('id, sender, subject, body_text, received_at, created_at')
    .eq('item_id', itemId);
  if (error) {
    console.error('Failed to load source emails:', error.message);
    throw new Error(error.message);
  }
  return orderSourceEmails((data as SourceEmailMessage[] | null) ?? []);
}

function DottedBreak() {
  const [count, setCount] = useState(24);
  return (
    <View
      style={s.sourceEmailBreak}
      onLayout={(event) => {
        const next = Math.max(8, Math.floor((event.nativeEvent.layout.width + 6) / 9));
        setCount((current) => (current === next ? current : next));
      }}
    >
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={s.sourceEmailDot} />
      ))}
    </View>
  );
}

function MessageBody({ text, id }: { text: string; id: string }) {
  const paragraphs = emailBodyParagraphs(text);
  if (paragraphs.length === 0) return <Text style={s.sourceEmailBody}>No message body.</Text>;
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <Text
          key={`${id}-${index}`}
          style={index < paragraphs.length - 1 ? [s.sourceEmailBody, s.sourceEmailParagraph] : s.sourceEmailBody}
        >
          {paragraph}
        </Text>
      ))}
    </>
  );
}

function QuotedSend({ part, id }: { part: EmailChainMessage; id: string }) {
  return (
    <View>
      <DottedBreak />
      <Text style={s.sourceEmailQuoteSender}>{part.sender?.trim() || 'Earlier message'}</Text>
      {part.sent ? <Text style={s.sourceEmailWhen}>{part.sent}</Text> : null}
      <View style={s.sourceEmailRule} />
      <MessageBody text={part.body} id={id} />
    </View>
  );
}

function formatReceived(raw: string | null): string | null {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function SourceEmailSheet({
  visible,
  itemId,
  onClose,
}: {
  visible: boolean;
  itemId: string | null;
  onClose: () => void;
}) {
  const [emails, setEmails] = useState<SourceEmailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const scrollMaxHeight = Math.max(240, Math.round(windowHeight * 0.62));

  useEffect(() => {
    if (!visible || !itemId) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    void loadSourceEmails(itemId)
      .then((rows) => {
        if (!cancelled) setEmails(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setEmails([]);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, itemId]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.planModalScrim}>
        <Pressable style={s.sourceEmailBackdrop} onPress={onClose} accessibilityLabel="Dismiss" />
        <View style={s.sourceEmailCard}>
          <Text style={s.sourceEmailTitle}>Original email</Text>
          {loading ? (
            <ActivityIndicator style={{ marginTop: 16 }} />
          ) : failed ? (
            <Text style={s.sourceEmailEmpty}>Couldn’t load the original email.</Text>
          ) : emails.length === 0 ? (
            <Text style={s.sourceEmailEmpty}>The original email isn’t saved for this one.</Text>
          ) : (
            <ScrollView
              style={[s.sourceEmailScroll, { maxHeight: scrollMaxHeight }]}
              contentContainerStyle={s.sourceEmailScrollContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              {emails.map((email, index) => {
                const received = formatReceived(email.received_at);
                const [latest, ...earlier] = splitEmailChain(email.body_text);
                return (
                  <View key={email.id} style={index > 0 ? s.sourceEmailNext : undefined}>
                    <View style={s.sourceEmailLetter}>
                      <Text style={s.sourceEmailSender}>{email.sender?.trim() || 'Unknown sender'}</Text>
                      <Text style={s.sourceEmailSubject}>{email.subject?.trim() || 'No subject'}</Text>
                      {received ? <Text style={s.sourceEmailWhen}>{received}</Text> : null}
                    </View>
                    <View style={s.sourceEmailRule} />
                    <MessageBody text={latest?.body ?? ''} id={email.id} />
                    {earlier.map((part, partIndex) => (
                      <QuotedSend key={`${email.id}-earlier-${partIndex}`} part={part} id={`${email.id}-${partIndex}`} />
                    ))}
                  </View>
                );
              })}
            </ScrollView>
          )}
          <Pressable onPress={onClose} style={s.sourceEmailClose} accessibilityRole="button">
            <Text style={s.homeSeeAll}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
