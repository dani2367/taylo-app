import { MoreSubHeader } from '@/components/app/MoreSubHeader';
import { appStyles as s } from '@/components/app/styles';
import { colors, fonts, fontSizes, radii, space } from '@/constants/theme';
import { memberPalette } from '@/lib/demo-data';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type FamilyMember = {
  id: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  birthday: string | null;
  school: string | null;
  invited: boolean | null;
};

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

function roleLabel(role: string) {
  const r = (role || '').toLowerCase();
  if (r === 'child') return 'Child';
  if (r === 'partner') return 'Partner';
  if (r === 'self' || r === 'you') return 'You';
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Family';
}

function displayName(m: FamilyMember) {
  return [m.first_name, m.last_name].filter(Boolean).join(' ') || 'Family member';
}

function Field({
  label,
  value,
  empty,
  last,
}: {
  label: string;
  value?: string;
  empty?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[s.psField, last && s.psFieldLast]}>
      <Text style={s.psFieldLabel}>{label}</Text>
      {empty || !value ? (
        <Text style={s.psFieldEmpty}>Not added yet</Text>
      ) : (
        <Text style={s.psFieldVal}>{value}</Text>
      )}
    </View>
  );
}

function EditField({
  label,
  value,
  onChangeText,
  placeholder,
  last,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  last?: boolean;
}) {
  return (
    <View style={[s.psField, ls.editField, last && s.psFieldLast]}>
      <Text style={[s.psFieldLabel, ls.editLabel]}>{label}</Text>
      <TextInput
        style={ls.editInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? '—'}
        placeholderTextColor={colors.textHint}
        autoCapitalize="words"
        returnKeyType="done"
      />
    </View>
  );
}

export default function FamilyScreen() {
  const insets = useSafeAreaInsets();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<FamilyMember | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Edit draft fields
  const [draftFirst, setDraftFirst] = useState('');
  const [draftLast, setDraftLast] = useState('');
  const [draftBirthday, setDraftBirthday] = useState('');
  const [draftSchool, setDraftSchool] = useState('');

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('family_members')
        .select('id, role, first_name, last_name, birthday, school, invited')
        .eq('user_id', user.id);

      setMembers((data as FamilyMember[] | null) ?? []);
      setLoading(false);
    }

    load();
  }, []);

  function openProfile(m: FamilyMember) {
    setProfile(m);
    setIsEditing(false);
  }

  function startEditing() {
    if (!profile) return;
    setDraftFirst(profile.first_name ?? '');
    setDraftLast(profile.last_name ?? '');
    setDraftBirthday(profile.birthday ?? '');
    setDraftSchool(profile.school ?? '');
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
  }

  async function saveEditing() {
    if (!profile) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('family_members')
      .update({
        first_name: draftFirst.trim() || null,
        last_name: draftLast.trim() || null,
        birthday: draftBirthday.trim() || null,
        school: draftSchool.trim() || null,
      })
      .eq('id', profile.id)
      .select('id, role, first_name, last_name, birthday, school, invited')
      .single();

    setSaving(false);

    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }

    const updated = data as FamilyMember;
    setProfile(updated);
    setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    setIsEditing(false);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.screen}>
        <MoreSubHeader title="Family" />
        <Text style={s.slabel}>Your family</Text>
        {loading ? (
          <View style={s.emptyState}>
            <ActivityIndicator color={colors.terracotta} />
          </View>
        ) : members.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyStateText}>No family members yet</Text>
          </View>
        ) : (
          <View style={s.fcard}>
            {members.map((m, i) => {
              const pal = memberPalette[i % memberPalette.length];
              const name = displayName(m);
              const tag = roleLabel(m.role);
              const detailBits = [tag, m.school, m.invited ? 'invited to Taylo' : null].filter(Boolean);
              return (
                <Pressable
                  key={m.id}
                  style={[s.fmember, i === members.length - 1 && s.fmemberLast]}
                  onPress={() => openProfile(m)}>
                  <View style={[s.favatar, { backgroundColor: colorMap[pal.bg] }]}>
                    <Text style={[s.favatarText, { color: colorMap[pal.fg] }]}>{name[0]}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.fname}>{name}</Text>
                    <Text style={s.fdetail}>{detailBits.join(' · ')}</Text>
                  </View>
                  <Text style={[s.ftag, { backgroundColor: colorMap[pal.bg], color: colorMap[pal.fg] }]}>
                    {tag}
                  </Text>
                  <Text style={s.fchevron}>›</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={!!profile} animationType="slide" onRequestClose={() => { setProfile(null); setIsEditing(false); }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ flex: 1, backgroundColor: colors.ivory }}>
            {/* Header */}
            <View style={[ls.psHeader, { paddingTop: insets.top + 14 }]}>
              <Pressable style={s.psBack} onPress={() => { setProfile(null); setIsEditing(false); }}>
                <Text style={s.psBackText}>← Back</Text>
              </Pressable>
              {profile ? <ProfileHeader member={profile} /> : null}
              {isEditing ? (
                <Pressable style={s.psEdit} onPress={() => void saveEditing()} disabled={saving}>
                  <Text style={s.psBackText}>{saving ? 'Saving…' : 'Save'}</Text>
                </Pressable>
              ) : (
                <Pressable style={s.psEdit} onPress={startEditing}>
                  <Text style={s.psBackText}>Edit</Text>
                </Pressable>
              )}
            </View>

            {isEditing ? (
              <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: 32 }}>
                {profile ? (
                  <EditBody
                    member={profile}
                    draftFirst={draftFirst}
                    draftLast={draftLast}
                    draftBirthday={draftBirthday}
                    draftSchool={draftSchool}
                    onChangeFirst={setDraftFirst}
                    onChangeLast={setDraftLast}
                    onChangeBirthday={setDraftBirthday}
                    onChangeSchool={setDraftSchool}
                  />
                ) : null}
                <Pressable style={ls.cancelBtn} onPress={cancelEditing}>
                  <Text style={ls.cancelBtnText}>Cancel</Text>
                </Pressable>
              </ScrollView>
            ) : (
              <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: 16 }}>
                {profile ? <MemberBody member={profile} /> : null}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function ProfileHeader({ member }: { member: FamilyMember }) {
  const pal = memberPalette[0];
  const name = displayName(member);
  return (
    <>
      <View style={[s.psAvatar, { backgroundColor: colorMap[pal.bg] }]}>
        <Text style={[s.psAvatarText, { color: colorMap[pal.fg] }]}>{name[0]}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.psName} numberOfLines={1}>{name}</Text>
        <Text style={s.psRole}>{roleLabel(member.role)}</Text>
      </View>
    </>
  );
}

function MemberBody({ member }: { member: FamilyMember }) {
  const isPartner = member.role?.toLowerCase() === 'partner';
  return (
    <>
      <View style={s.psSection}>
        <Text style={s.psSectionTitle}>Details</Text>
        <Field label="Name" value={displayName(member)} />
        <Field label="Role" value={roleLabel(member.role)} />
        <Field label="Birthday" value={member.birthday || undefined} empty={!member.birthday} />
        <Field
          label="School / nursery"
          value={member.school || undefined}
          empty={!member.school}
          last={!isPartner}
        />
        {isPartner ? (
          <Field
            label="Invited to Taylo"
            value={member.invited ? '✓ Invited' : 'Not yet'}
            last
          />
        ) : null}
      </View>
    </>
  );
}

function EditBody({
  member,
  draftFirst,
  draftLast,
  draftBirthday,
  draftSchool,
  onChangeFirst,
  onChangeLast,
  onChangeBirthday,
  onChangeSchool,
}: {
  member: FamilyMember;
  draftFirst: string;
  draftLast: string;
  draftBirthday: string;
  draftSchool: string;
  onChangeFirst: (v: string) => void;
  onChangeLast: (v: string) => void;
  onChangeBirthday: (v: string) => void;
  onChangeSchool: (v: string) => void;
}) {
  return (
    <View style={s.psSection}>
      <Text style={s.psSectionTitle}>Edit details</Text>
      <EditField label="First name" value={draftFirst} onChangeText={onChangeFirst} placeholder="First name" />
      <EditField label="Last name" value={draftLast} onChangeText={onChangeLast} placeholder="Last name" />
      <EditField
        label="Birthday"
        value={draftBirthday}
        onChangeText={onChangeBirthday}
        placeholder="e.g. 2018-04-12"
      />
      <EditField
        label="School / nursery"
        value={draftSchool}
        onChangeText={onChangeSchool}
        placeholder="School name"
        last
      />
    </View>
  );
}

const ls = StyleSheet.create({
  psHeader: {
    backgroundColor: colors.ivory,
    paddingHorizontal: 14,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(23,43,69,0.06)',
  },
  editField: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editLabel: {
    width: 110,
    flexShrink: 0,
  },
  editInput: {
    flex: 1,
    fontSize: fontSizes.body,
    fontFamily: fonts.sansMedium,
    color: colors.navy,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(23,43,69,0.12)',
  },
  cancelBtn: {
    marginHorizontal: space.gutter,
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: 'rgba(23,43,69,0.1)',
  },
  cancelBtnText: {
    fontSize: fontSizes.body,
    fontFamily: fonts.sansRegular,
    color: colors.textMuted,
  },
});
