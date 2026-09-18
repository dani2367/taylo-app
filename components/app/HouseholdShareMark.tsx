import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';

/** Filled house in the card corner — only when the item is shared. */
export function SharedHouseCorner({ shared }: { shared: boolean }) {
  if (!shared) return null;
  return (
    <View
      style={s.sharedHouseCorner}
      pointerEvents="none"
      accessibilityLabel="Visible to household">
      <Ionicons name="home" size={13} color={colors.terracotta} />
    </View>
  );
}

/** Expanded control: household toggle, using the same switch as More. */
export function HouseholdShareToggle({
  shared,
  onToggle,
}: {
  shared: boolean;
  onToggle?: () => void;
}) {
  if (!onToggle && !shared) return null;
  const label = shared ? 'Household' : 'Just you';
  const sub = shared ? 'The other login can see this too.' : 'Only you can see this.';
  return (
    <Pressable
      style={s.shareToggleRow}
      onPress={
        onToggle
          ? (e) => {
              e.stopPropagation();
              onToggle();
            }
          : undefined
      }
      disabled={!onToggle}
      accessibilityRole={onToggle ? 'switch' : 'text'}
      accessibilityState={{ checked: shared }}
      accessibilityLabel={`${label}. ${sub}`}>
      <View style={[s.shareToggleIcon, { backgroundColor: colors.blush }]}>
        <Ionicons name={shared ? 'home' : 'home-outline'} size={16} color={colors.terracotta} />
      </View>
      <View style={s.shareToggleCopy}>
        <Text style={s.shareToggleLabel}>{label}</Text>
        <Text style={s.shareToggleSub}>{sub}</Text>
      </View>
      {onToggle ? (
        <View style={[s.tswitch, shared && s.tswitchOn]} pointerEvents="none">
          <View style={[s.tknob, shared && s.tknobOn]} />
        </View>
      ) : null}
    </Pressable>
  );
}
