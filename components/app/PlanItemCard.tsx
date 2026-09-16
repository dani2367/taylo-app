import { BrandIconDisc } from '@/components/app/BrandIcon';
import { HouseholdShareToggle, SharedHouseCorner } from '@/components/app/HouseholdShareMark';
import { ItemPrepChecklist, type PrepCheckItem } from '@/components/app/ItemPrepChecklist';
import { appStyles as s } from '@/components/app/styles';
import { TayloMark } from '@/components/app/TayloMark';
import type { PlanIconSpec } from '@/lib/plan-icon';
import { extraEventContext } from '@/lib/suggestion';
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
  icon: PlanIconSpec;
  prepLabel: string | null;
  checklistId: string | null;
  checklist: PrepCheckItem[];
  checklistHeading?: string;
  listMode?: boolean;
  hideTitle?: boolean;
  checklistRowsAreItems?: boolean;
  collectionId?: string;
  informational?: boolean;
  createdBy?: string | null;
  visibility?: 'private' | 'shared';
};

export function PlanItemCard({
  card,
  expanded,
  editingPrep,
  variant = 'card',
  last = false,
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
  variant?: 'card' | 'hero';
  last?: boolean;
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
  const informational = !!card.informational;
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
  const shared = card.visibility === 'shared';

  const body = (
    <>
      <SharedHouseCorner shared={shared} />
      {card.hideTitle ? null : (
        <View style={[s.nrow, shared && { paddingRight: 22 }]}>
          <View style={{ flexShrink: 0 }}>
            <BrandIconDisc name={card.icon.name} wash={card.icon.wash} size={hero ? 36 : undefined} />
          </View>
          <View style={s.ncopy}>
            {hero ? (
              <>
                <Text style={s.homeItemTitle}>{card.title}</Text>
                {support ? <Text style={s.homeItemSub}>{support}</Text> : null}
              </>
            ) : (
              <View style={s.uheadRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.utitle}>{card.title}</Text>
                  {support ? <Text style={s.usub}>{support}</Text> : null}
                </View>
                <Text style={[s.uchevron, isOpen && { transform: [{ rotate: '90deg' }] }]}>›</Text>
              </View>
            )}
          </View>
        </View>
      )}
      {isOpen ? (
        <>
          {showDetail ? (
            <Text style={hero ? s.homeExpandDetail : s.udetail}>{eventContext}</Text>
          ) : null}
          {showSuggest ? (
            <View style={s.nsuggestRow}>
              <TayloMark />
              <Text style={hero ? s.homeSuggest : s.nsuggest}>{card.suggestion}</Text>
            </View>
          ) : null}
          <ItemPrepChecklist
            heading={card.checklistHeading || (card.listMode || hero ? undefined : 'Getting ready')}
            items={card.checklist}
            editing={editingPrep}
            onToggleEditing={onTogglePrepEditing}
            onToggle={onToggleChecklist}
            onChangeText={onChangeChecklistText}
            onCommitText={onCommitChecklistText}
            onAdd={onAddChecklist}
            onDelete={onDeleteChecklist}
          />
          {card.listMode || informational ? null : (
            <>
              <HouseholdShareToggle shared={shared} onToggle={onShare} />
              <View style={hero ? s.nactions : s.uactions}>
              <Pressable
                style={[s.pill, s.pillTeal]}
                onPress={(e) => {
                  e.stopPropagation();
                  onDone();
                }}>
                <Text style={[s.pillText, s.pillTextTeal]}>Done</Text>
              </Pressable>
              <Pressable
                style={[s.pill, s.pillDelegate]}
                onPress={(e) => {
                  e.stopPropagation();
                  onDelegate();
                }}>
                <Text style={[s.pillText, s.pillTextBlue]}>Delegate</Text>
              </Pressable>
              <Pressable
                style={[s.pill, s.pillChat]}
                onPress={(e) => {
                  e.stopPropagation();
                  onChat();
                }}>
                <Text style={[s.pillText, s.pillTextChat]}>Ask</Text>
              </Pressable>
            </View>
            </>
          )}
        </>
      ) : null}
    </>
  );

  if (informational) {
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

  return (
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
          style={hero ? [s.homeHeroRow, last && !isOpen && s.homeHeroRowLast] : s.planCard}
          onPress={alwaysOpen ? undefined : onToggleExpand}>
          {body}
        </Pressable>
      </View>
    </Swipeable>
  );
}
