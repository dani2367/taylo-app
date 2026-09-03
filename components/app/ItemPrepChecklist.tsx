import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import { Pressable, Text, TextInput, View } from 'react-native';

export type PrepCheckItem = {
  id: string;
  text: string;
  done: boolean;
};

export function ItemPrepChecklist({
  items,
  onToggle,
  heading,
  editing,
  onToggleEditing,
  onChangeText,
  onCommitText,
  onAdd,
  onDelete,
}: {
  items: PrepCheckItem[];
  onToggle: (id: string, nextDone: boolean) => void;
  heading?: string;
  editing?: boolean;
  onToggleEditing?: () => void;
  onChangeText?: (id: string, text: string) => void;
  onCommitText?: (id: string, text: string) => void;
  onAdd?: () => void;
  onDelete?: (id: string) => void;
}) {
  const canEdit = !!onToggleEditing;
  if (!items.length && !canEdit && !editing) return null;

  return (
    <View style={s.prepList}>
      <View style={s.prepHeadingRow}>
        {heading ? <Text style={s.prepHeading}>{heading}</Text> : <View />}
        {onToggleEditing ? (
          <Pressable
            style={s.prepEditBtn}
            onPress={(e) => {
              e.stopPropagation();
              onToggleEditing();
            }}>
            <Text style={s.prepEditBtnText}>{editing ? 'Done' : 'Edit'}</Text>
          </Pressable>
        ) : null}
      </View>
      {items.map((item) => (
        <PrepRow
          key={item.id}
          item={item}
          editing={!!editing && !!onChangeText}
          onToggle={onToggle}
          onChangeText={onChangeText}
          onCommitText={onCommitText}
          onDelete={onDelete}
        />
      ))}
      {editing && onAdd ? (
        <Pressable
          style={s.prepAdd}
          onPress={(e) => {
            e.stopPropagation();
            onAdd();
          }}>
          <Text style={s.prepAddText}>+ Add</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PrepRow({
  item,
  editing,
  onToggle,
  onChangeText,
  onCommitText,
  onDelete,
}: {
  item: PrepCheckItem;
  editing: boolean;
  onToggle: (id: string, nextDone: boolean) => void;
  onChangeText?: (id: string, text: string) => void;
  onCommitText?: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <View style={s.prepRow}>
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          onToggle(item.id, !item.done);
        }}>
        <View style={[s.hcheck, item.done && s.hcheckOn]}>
          {item.done ? <Text style={s.hcheckMark}>✓</Text> : null}
        </View>
      </Pressable>
      {editing && onChangeText ? (
        <TextInput
          style={s.prepInput}
          value={item.text}
          onChangeText={(text) => onChangeText(item.id, text)}
          onEndEditing={(e) => onCommitText?.(item.id, e.nativeEvent.text)}
          onPressIn={(e) => e.stopPropagation()}
          placeholder="Something to do"
          placeholderTextColor={colors.textHint}
        />
      ) : (
        <Pressable
          style={{ flex: 1 }}
          onPress={(e) => {
            e.stopPropagation();
            onToggle(item.id, !item.done);
          }}>
          <Text style={[s.htext, item.done && s.htextDone]}>{item.text}</Text>
        </Pressable>
      )}
      {editing && onDelete ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onDelete(item.id);
          }}
          hitSlop={8}>
          <Text style={s.prepDelete}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
