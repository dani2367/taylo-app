import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import { demoFamily, memberPalette } from '@/lib/demo-data';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ProfileKind = { type: 'self' } | { type: 'kid'; index: number } | { type: 'partner' };

const colorMap = {
  roseLight: colors.roseLight,
  roseDark: colors.roseDark,
  blueLight: colors.blueLight,
  blue: colors.blue,
  amberLight: colors.amberLight,
  amber: colors.amber,
  tealLight: colors.tealLight,
  teal: colors.teal,
};

function Field({
  label,
  value,
  empty,
  last,
  valueColor,
}: {
  label: string;
  value?: string;
  empty?: boolean;
  last?: boolean;
  valueColor?: string;
}) {
  return (
    <View style={[s.psField, last && s.psFieldLast]}>
      <Text style={s.psFieldLabel}>{label}</Text>
      {empty ? (
        <Text style={s.psFieldEmpty}>Not added yet</Text>
      ) : (
        <Text style={[s.psFieldVal, valueColor ? { color: valueColor } : null]}>{value}</Text>
      )}
    </View>
  );
}

export default function FamilyScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<ProfileKind | null>(null);
  const n = demoFamily.name;
  const members: {
    key: string;
    letter: string;
    name: string;
    detail: string;
    tag: string;
    palette: (typeof memberPalette)[number];
    open: ProfileKind;
  }[] = [
    {
      key: 'self',
      letter: n[0],
      name: `${n} ${demoFamily.lastName} (you)`,
      detail: `Gmail · Google Calendar · ${demoFamily.school}`,
      tag: 'You',
      palette: memberPalette[0],
      open: { type: 'self' },
    },
    ...demoFamily.kids.map((k, i) => ({
      key: `kid-${i}`,
      letter: k.name[0],
      name: k.name,
      detail: `Age ${k.age} · ${k.school}`,
      tag: 'Child',
      palette: memberPalette[i + 1],
      open: { type: 'kid' as const, index: i },
    })),
    {
      key: 'partner',
      letter: demoFamily.partner[0],
      name: demoFamily.partner,
      detail: demoFamily.partnerInvited ? 'Partner · invited to Taylo' : 'Partner · receives delegated nudges',
      tag: 'Partner',
      palette: memberPalette[3],
      open: { type: 'partner' as const },
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.screen}>
        <View style={s.subnav}>
          <Pressable onPress={() => router.back()}>
            <Text style={s.subnavBack}>← More</Text>
          </Pressable>
          <Text style={s.subnavTitle}>Family</Text>
        </View>
        <Text style={s.slabel}>Your family</Text>
        <View style={s.fcard}>
          {members.map((m, i) => (
            <Pressable
              key={m.key}
              style={[s.fmember, i === members.length - 1 && s.fmemberLast]}
              onPress={() => setProfile(m.open)}>
              <View style={[s.favatar, { backgroundColor: colorMap[m.palette.bg] }]}>
                <Text style={[s.favatarText, { color: colorMap[m.palette.fg] }]}>{m.letter}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.fname}>{m.name}</Text>
                <Text style={s.fdetail}>{m.detail}</Text>
              </View>
              <Text style={[s.ftag, { backgroundColor: colorMap[m.palette.bg], color: colorMap[m.palette.fg] }]}>
                {m.tag}
              </Text>
              <Text style={s.fchevron}>›</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Modal visible={!!profile} animationType="slide" onRequestClose={() => setProfile(null)}>
        <View style={{ flex: 1, backgroundColor: colors.grayLight }}>
          <View style={[s.psHeader, { paddingTop: insets.top + 14 }]}>
            <Pressable style={s.psBack} onPress={() => setProfile(null)}>
              <Text style={s.psBackText}>← Back</Text>
            </Pressable>
            <ProfileHeader kind={profile} />
            <Pressable style={s.psEdit} onPress={() => Alert.alert('Edit mode — available in the live app')}>
              <Text style={s.psBackText}>Edit</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: 16 }}>
            {profile?.type === 'self' ? (
              <SelfBody
                onManageConnections={() => {
                  setProfile(null);
                  router.push('/more/connections');
                }}
              />
            ) : null}
            {profile?.type === 'kid' ? <KidBody index={profile.index} /> : null}
            {profile?.type === 'partner' ? <PartnerBody /> : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function ProfileHeader({ kind }: { kind: ProfileKind | null }) {
  if (!kind) return null;
  if (kind.type === 'self') {
    return (
      <>
        <View style={[s.psAvatar, { backgroundColor: colors.roseLight }]}>
          <Text style={[s.psAvatarText, { color: colors.roseDark }]}>{demoFamily.name[0]}</Text>
        </View>
        <View>
          <Text style={s.psName}>{`${demoFamily.name} ${demoFamily.lastName}`}</Text>
          <Text style={s.psRole}>Your profile</Text>
        </View>
      </>
    );
  }
  if (kind.type === 'kid') {
    const k = demoFamily.kids[kind.index];
    const pal = kind.index === 0 ? memberPalette[1] : memberPalette[2];
    return (
      <>
        <View style={[s.psAvatar, { backgroundColor: colorMap[pal.bg] }]}>
          <Text style={[s.psAvatarText, { color: colorMap[pal.fg] }]}>{k.name[0]}</Text>
        </View>
        <View>
          <Text style={s.psName}>{k.name}</Text>
          <Text style={s.psRole}>{`Age ${k.age}`}</Text>
        </View>
      </>
    );
  }
  return (
    <>
      <View style={[s.psAvatar, { backgroundColor: colors.tealLight }]}>
        <Text style={[s.psAvatarText, { color: colors.teal }]}>{demoFamily.partner[0]}</Text>
      </View>
      <View>
        <Text style={s.psName}>{demoFamily.partner}</Text>
        <Text style={s.psRole}>Partner</Text>
      </View>
    </>
  );
}

function SelfBody({ onManageConnections }: { onManageConnections: () => void }) {
  return (
    <>
      <View style={s.psSection}>
        <Text style={s.psSectionTitle}>About you</Text>
        <Field label="Name" value={`${demoFamily.name} ${demoFamily.lastName}`} />
        <Field label="Email" value="Connected via Gmail" />
        <Field label="Notifications" value="In-app + reminders" last />
      </View>
      <View style={s.psSection}>
        <Text style={s.psSectionTitle}>Connected accounts</Text>
        <Field label="Gmail" value="✓ Connected" valueColor={colors.teal} />
        <Field label="Google Calendar" value="✓ Connected" valueColor={colors.teal} last />
      </View>
      <Pressable style={s.psAddBtn} onPress={onManageConnections}>
        <Text style={s.psAddBtnText}>Manage connections →</Text>
      </Pressable>
    </>
  );
}

function KidBody({ index }: { index: number }) {
  const k = demoFamily.kids[index];
  const friends =
    index === 0
      ? [
          { name: 'Mia Patel', detail: 'Classmate · Mum: Claire (07700 900123)', bday: '7 June — Saturday!' },
          { name: 'Oscar Williams', detail: 'Best friend · Mum: Jess (07700 900456)', bday: '14 Sept' },
        ]
      : [];
  return (
    <>
      <View style={s.psSection}>
        <Text style={s.psSectionTitle}>Details</Text>
        <Field label="Age" value={String(k.age)} />
        <Field label="Birthday" empty />
        <Field label="School / nursery" value={k.school} />
        <Field label="Year group" empty last />
      </View>
      <View style={s.psSection}>
        <Text style={s.psSectionTitle}>Medical</Text>
        <Field label="Allergies" empty />
        <Field label="Conditions" empty />
        <Field label="GP surgery" empty last />
      </View>
      <View style={s.psSection}>
        <Text style={s.psSectionTitle}>Friends 💕</Text>
        {friends.length ? (
          friends.map((f, i) => (
            <View key={f.name} style={[s.psField, s.psFieldCol, i === friends.length - 1 && s.psFieldLast]}>
              <Text style={s.psFieldVal}>{f.name}</Text>
              <Text style={s.psFieldLabel}>{f.detail}</Text>
              <Text style={s.friendBday}>🎂 {f.bday}</Text>
            </View>
          ))
        ) : (
          <View style={[s.psField, s.psFieldLast]}>
            <Text style={s.psFieldEmpty}>No friends added yet</Text>
          </View>
        )}
      </View>
      <Pressable style={s.psAddBtn} onPress={() => Alert.alert('Add a friend — available in the live app')}>
        <Text style={s.psAddBtnText}>+ Add a friend</Text>
      </Pressable>
    </>
  );
}

function PartnerBody() {
  return (
    <>
      <View style={s.psSection}>
        <Text style={s.psSectionTitle}>Details</Text>
        <Field label="Name" value={demoFamily.partner} />
        <Field
          label="Invited to Taylo"
          value={demoFamily.partnerInvited ? '✓ Invited' : 'Not yet'}
          valueColor={demoFamily.partnerInvited ? colors.teal : colors.textHint}
          last
        />
      </View>
      <View style={s.psSection}>
        <Text style={s.psSectionTitle}>Taylo settings</Text>
        <Field label="Delegated nudges" value="✓ Enabled" valueColor={colors.teal} />
        <Field label="Notification channel" empty last />
      </View>
    </>
  );
}
