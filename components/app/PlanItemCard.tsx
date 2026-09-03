import { ItemPrepChecklist, type PrepCheckItem } from '@/components/app/ItemPrepChecklist';
import { appStyles as s } from '@/components/app/styles';
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
  emoji: string;
  prepLabel: string | null;
  checklistId: string | null;
  checklist: PrepCheckItem[];
  checklistHeading?: string;
};

export function PlanItemCard({
  card,
  expanded,
  editingPrep,
  onToggleExpand,
  onDismiss,
  onDone,
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
  onToggleExpand: () => void;
  onDismiss: () => void;
  onDone: () => void;
  onDelegate: () => void;
  onChat: () => void;
  onTogglePrepEditing: () => void;
  onToggleChecklist: (id: string, done: boolean) => void;
  onChangeChecklistText: (id: string, text: string) => void;
  onCommitChecklistText: (id: string, text: string) => void;
  onAddChecklist: () => void;
  onDeleteChecklist: (id: string) => void;
}) {
  const showDetail = !!card.detail && card.detail !== card.context && card.detail !== card.title;
  return (
    <Swipeable
      overshootRight={false}
      renderRightActions={() => (
        <Pressable style={s.nudgeSwipeDelete} onPress={onDismiss}>
          <Text style={s.nudgeSwipeDeleteText}>Delete</Text>
        </Pressable>
      )}>
      <Pressable style={s.uitem} onPress={onToggleExpand}>
        <Text style={s.planEmoji}>{card.emoji}</Text>
        <View style={s.ubody}>
          <View style={s.uheadRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.utitle}>{card.title}</Text>
              {card.context ? <Text style={s.usub}>{card.context}</Text> : null}
              {!expanded && card.prepLabel ? <Text style={s.usub}>{card.prepLabel}</Text> : null}
            </View>
            <Text style={[s.uchevron, expanded && { transform: [{ rotate: '90deg' }] }]}>›</Text>
          </View>
          {expanded ? (
            <>
              {showDetail ? <Text style={s.udetail}>{card.detail}</Text> : null}
              <ItemPrepChecklist
                heading={card.checklistHeading || 'Getting ready'}
                items={card.checklist}
                editing={editingPrep}
                onToggleEditing={onTogglePrepEditing}
                onToggle={onToggleChecklist}
                onChangeText={onChangeChecklistText}
                onCommitText={onCommitChecklistText}
                onAdd={onAddChecklist}
                onDelete={onDeleteChecklist}
              />
              {card.suggestion ? <Text style={s.nsuggest}>{card.suggestion}</Text> : null}
              <View style={s.uactions}>
                <Pressable
                  style={[s.pill, s.pillTeal]}
                  onPress={(e) => {
                    e.stopPropagation();
                    onDone();
                  }}>
                  <Text style={[s.pillText, s.pillTextTeal]}>✓ Done</Text>
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
                  <Text style={[s.pillText, s.pillTextChat]}>💬 Chat</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </Pressable>
    </Swipeable>
  );
}
