import { BrandIconDisc } from '@/components/app/BrandIcon';
import { DayTimelineRow } from '@/components/app/DayTimelineCard';
import { HouseholdShareToggle, SharedHouseCorner } from '@/components/app/HouseholdShareMark';
import { ItemPrepChecklist, type PrepCheckItem } from '@/components/app/ItemPrepChecklist';
import { SourceEmailSheet, loadSourceEmails } from '@/components/app/SourceEmailSheet';
import { appStyles as s } from '@/components/app/styles';
import { TayloMark } from '@/components/app/TayloMark';
import { washColor, type PlanIconSpec } from '@/lib/plan-icon';
import { originalEmailVisible } from '@/lib/source-email';
import { extraEventContext } from '@/lib/suggestion';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

export type PlanItemCardModel = {
  id: string;
  title: string;
  context: string | null;
  detail: string;
  suggestion: string | null;
  opener: string;
  src: string;
  askSub?: string | null;
  rowKey?: string;
  icon: PlanIconSpec;
  prepLabel: string | null;
  checklist: PrepCheckItem[];
  checklistHeading?: string;
  listMode?: boolean;
  hideTitle?: boolean;
  checklistRowsAreItems?: boolean;
  collectionId?: string;
  collectionType?: string | null;
  informational?: boolean;
  pastParentLeftover?: boolean;
  createdBy?: string | null;
  visibility?: 'private' | 'shared';
  timelineTime?: string | null;
  /** Provenance. The original-email link is gated on this, never on kind. */
  source?: string | null;
  /** `source_emails.item_id` — the parent when this card is a checklist child. */
  sourceEmailItemId?: string | null;
};

export function PlanItemCard({
  card,
  expanded,
  editingPrep,
  variant = 'card',
  last = false,
  index = 0,
  count = 1,
  onToggleExpand,
  onDismiss,
  onDone,
  onShare,
  onDelegate,
  onChat,
  onTogglePrepEditing,
  onToggleChecklist,
  onChangeChecklistText,
  onCommitChecklistText,
  onAddChecklist,
  onDeleteChecklist,
}: {
  card: PlanItemCardModel;
  expanded: boolean;
  editingPrep: boolean;
  variant?: 'card' | 'hero' | 'timeline';
  last?: boolean;
  index?: number;
  count?: number;
  onToggleExpand: () => void;
  onDismiss: () => void;
  onDone: () => void;
  onShare?: () => void;
  onDelegate: () => void;
  onChat: () => void;
  onTogglePrepEditing: () => void;
  onToggleChecklist: (id: string, done: boolean) => void;
  onChangeChecklistText: (id: string, text: string) => void;
  onCommitChecklistText: (id: string, text: string) => void;
  onAddChecklist: () => void;
  onDeleteChecklist: (id: string) => void;
}) {
  const hero = variant === 'hero';
  const timeline = variant === 'timeline';
  const nestedItemChecklist = !!card.checklistRowsAreItems && card.checklist.length > 0;
  const informational = !!card.informational && !nestedItemChecklist;
  const alwaysOpen = !!card.hideTitle;
  const isOpen = !informational && (expanded || alwaysOpen);
  const eventContext = extraEventContext(card.title, card.detail);
  const showDetail = !informational && !card.listMode && !!eventContext;
  const showSuggest =
    !informational &&
    !card.listMode &&
    !!card.suggestion &&
    card.suggestion !== eventContext &&
    card.suggestion !== card.title;
  const support = card.context && !card.listMode ? card.context : !isOpen && card.prepLabel ? card.prepLabel : null;
  const hideCollapsedSub = isOpen && (hero || timeline);
  const collapsedSub = hideCollapsedSub ? null : support;
  const shared = card.visibility === 'shared';
  // Hide a lone *local* prep line (user can add a second). Nested item children stay
  // visible even when there is only one — the parent is the card they hang off.
  const showChecklistList = card.listMode || card.hideTitle || nestedItemChecklist || card.checklist.length >= 2;
  const showAddChecklist = !card.listMode && !showChecklistList;
  const expandWrap = hero ? s.homeExpandBlock : timeline ? s.homeDayExpand : null;
  const sourceEmailItemId = card.sourceEmailItemId || card.id;
  const [attachedEmails, setAttachedEmails] = useState(0);
  const [emailOpen, setEmailOpen] = useState(false);
  const showOriginalEmail = isOpen && originalEmailVisible(card.source, attachedEmails);

  useEffect(() => {
    if (!isOpen || card.source !== 'calendar') return;
    let cancelled = false;
    setAttachedEmails(0);
    void loadSourceEmails(sourceEmailItemId)
      .then((rows) => {
        if (!cancelled) setAttachedEmails(rows.length);
      })
      .catch(() => {
        if (!cancelled) setAttachedEmails(0);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, card.source, sourceEmailItemId]);

  function addChecklist(e: { stopPropagation: () => void }) {
    e.stopPropagation();
    if (!editingPrep) onTogglePrepEditing();
    onAddChecklist();
  }

  const body = (
    <>
      {timeline ? null : <SharedHouseCorner shared={shared} />}
      {card.hideTitle ? null : timeline ? (
        <DayTimelineRow
          item={{
            id: card.id,
            title: card.title,
            time: card.timelineTime || '',
            sub: collapsedSub,
            icon: card.icon,
            informational,
          }}
          index={index}
          count={count}
        />
      ) : (
        <View style={[s.nrow, shared && { paddingRight: 22 }]}>
          <View style={{ flexShrink: 0 }}>
            <BrandIconDisc name={card.icon.name} wash={card.icon.wash} size={hero ? 36 : undefined} />
          </View>
          <View style={s.ncopy}>
            {hero ? (
              <>
                <Text style={s.homeItemTitle}>{card.title}</Text>
                {collapsedSub ? <Text style={s.homeItemSub}>{collapsedSub}</Text> : null}
              </>
            ) : (
              <View style={s.uheadRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.utitle}>{card.title}</Text>
                  {collapsedSub ? <Text style={s.usub}>{collapsedSub}</Text> : null}
                </View>
                <Text style={[s.uchevron, isOpen && { transform: [{ rotate: '90deg' }] }]}>›</Text>
              </View>
            )}
          </View>
        </View>
      )}
      {isOpen ? (
        <View style={expandWrap ?? undefined}>
          {card.pastParentLeftover ? (
            <Text style={hero || timeline ? s.homeExpandDetail : s.udetail}>This already happened</Text>
          ) : showDetail ? (
            <Text style={hero || timeline ? s.homeExpandDetail : s.udetail}>{eventContext}</Text>
          ) : null}
          {card.pastParentLeftover || !showSuggest ? null : (
            <View style={s.nsuggestRow}>
              <TayloMark />
              <Text style={hero || timeline ? s.homeSuggest : s.nsuggest}>{card.suggestion}</Text>
            </View>
          )}
          {showChecklistList ? (
            <ItemPrepChecklist
              heading={card.checklistHeading}
              items={card.checklist}
              editing={editingPrep}
              hideEmptyCta={!card.listMode}
              onToggleEditing={onTogglePrepEditing}
              onToggle={onToggleChecklist}
              onChangeText={onChangeChecklistText}
              onCommitText={onCommitChecklistText}
              onAdd={onAddChecklist}
              onDelete={onDeleteChecklist}
            />
          ) : null}
          {informational ? null : (
            <>
              <HouseholdShareToggle shared={shared} onToggle={onShare} />
              {card.listMode ? null : card.pastParentLeftover ? (
                <View style={s.itemActions}>
                  <Pressable
                    style={[s.itemActionPill, { backgroundColor: washColor[card.icon.wash] }]}
                    accessibilityRole="button"
                    accessibilityLabel="Did it"
                    onPress={(e) => {
                      e.stopPropagation();
                      onDone();
                    }}>
                    <Text style={s.itemActionPillText}>Did it</Text>
                  </Pressable>
                  <Pressable
                    style={[s.itemActionPill, s.itemActionPillOutline]}
                    accessibilityRole="button"
                    accessibilityLabel="Not needed"
                    onPress={(e) => {
                      e.stopPropagation();
                      onDismiss();
                    }}>
                    <Text style={s.itemActionPillText}>Not needed</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={s.itemActions}>
                  <Pressable
                    style={[s.itemActionPill, { backgroundColor: washColor[card.icon.wash] }]}
                    onPress={(e) => {
                      e.stopPropagation();
                      onDone();
                    }}>
                    <Text style={s.itemActionPillText}>Done</Text>
                  </Pressable>
                  <Pressable
                    style={[s.itemActionPill, s.itemActionPillOutline]}
                    onPress={(e) => {
                      e.stopPropagation();
                      onDelegate();
                    }}>
                    <Text style={s.itemActionPillText}>Delegate</Text>
                  </Pressable>
                  <Pressable
                    style={[s.itemActionPill, s.itemActionPillOutline]}
                    onPress={(e) => {
                      e.stopPropagation();
                      onChat();
                    }}>
                    <Text style={s.itemActionPillText}>Ask</Text>
                  </Pressable>
                  {showAddChecklist ? (
                    <Pressable
                      style={s.itemActionAdd}
                      accessibilityRole="button"
                      accessibilityLabel="Add a checklist"
                      onPress={addChecklist}>
                      <Text style={s.itemActionAddText}>Add a checklist</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
              {showOriginalEmail ? (
                <Pressable
                  style={s.itemSourceLink}
                  accessibilityRole="button"
                  accessibilityLabel="View original email"
                  onPress={(e) => {
                    e.stopPropagation();
                    setEmailOpen(true);
                  }}>
                  <Text style={s.itemActionAddText}>View original email</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </>
  );

  if (informational) {
    if (timeline) {
      return (
        <View>
          <DayTimelineRow
            item={{
              id: card.id,
              title: card.title,
              time: card.timelineTime || '',
              sub: support,
              icon: card.icon,
              informational: true,
            }}
            index={index}
            count={count}
          />
        </View>
      );
    }
    return (
      <View style={hero ? [s.homeHeroRow, last && s.homeHeroRowLast] : s.planCard}>
        <View style={s.nrow}>
          <View style={s.familyInfoDot} />
          <View style={s.ncopy}>
            <Text style={s.familyInfoTitle}>{card.title}</Text>
            {support ? <Text style={s.homeItemSub}>{support}</Text> : null}
          </View>
        </View>
      </View>
    );
  }

  const sheet = (
    <SourceEmailSheet
      visible={emailOpen}
      itemId={sourceEmailItemId}
      onClose={() => setEmailOpen(false)}
    />
  );

  return (
    <>
      <Swipeable
        overshootRight={false}
        containerStyle={{ width: '100%' }}
        childrenContainerStyle={{ width: '100%' }}
        renderRightActions={() => (
          <Pressable style={s.nudgeSwipeDelete} onPress={onDismiss}>
            <Text style={s.nudgeSwipeDeleteText}>Delete</Text>
          </Pressable>
        )}>
        <View style={{ width: '100%' }}>
          <Pressable
            style={
              timeline
                ? isOpen
                  ? s.homeDayRowOpen
                  : undefined
                : hero
                  ? [s.homeHeroRow, isOpen && s.homeHeroRowOpen, last && !isOpen && s.homeHeroRowLast]
                  : s.planCard
            }
            onPress={alwaysOpen ? undefined : onToggleExpand}>
            {body}
          </Pressable>
        </View>
      </Swipeable>
      {sheet}
    </>
  );
}
