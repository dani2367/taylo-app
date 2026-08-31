import { appStyles as s } from '@/components/app/styles';
import { colors } from '@/constants/theme';
import { memberPalette } from '@/lib/demo-data';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
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
      {empty || !value ? (
        <Text style={s.psFieldEmpty}>Not added yet</Text>
      ) : (
        <Text style={[s.psFieldVal, valueColor ? { color: valueColor } : null]}>{value}</Text>
      )}
    </View>
  );
}

export default function FamilyScreen() {
  const insets = useSafeAreaInsets();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [profile, setProfile] = useState<FamilyMember | null>(null);

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
    }

    load();
  }, []);

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
        {members.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyStateText}>No family members yet</Text>
          </View>
        ) : (
          <View style={s.fcard}>
            {members.map((m, i) => {
              const pal = memberPalette[i % memberPalette.length];
              const name = displayName(m);
              const tag = roleLabel(m.role);
              const detailBits = [
                tag,
                m.school,
                m.invited ? 'invited to Taylo' : null,
              ].filter(Boolean);
              return (
                <Pressable
                  key={m.id}
                  style={[s.fmember, i === members.length - 1 && s.fmemberLast]}
                  onPress={() => setProfile(m)}>
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

      <Modal visible={!!profile} animationType="slide" onRequestClose={() => setProfile(null)}>
        <View style={{ flex: 1, backgroundColor: colors.grayLight }}>
          <View style={[s.psHeader, { paddingTop: insets.top + 14 }]}>
            <Pressable style={s.psBack} onPress={() => setProfile(null)}>
              <Text style={s.psBackText}>← Back</Text>
            </Pressable>
            {profile ? <ProfileHeader member={profile} /> : null}
            <Pressable style={s.psEdit} onPress={() => Alert.alert('Edit mode — available in the live app')}>
              <Text style={s.psBackText}>Edit</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: 16 }}>
            {profile ? <MemberBody member={profile} /> : null}
          </ScrollView>
        </View>
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
      <View>
        <Text style={s.psName}>{name}</Text>
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
        <Field label="School / nursery" value={member.school || undefined} empty={!member.school} last={!isPartner} />
        {isPartner ? (
          <Field
            label="Invited to Taylo"
            value={member.invited ? '✓ Invited' : 'Not yet'}
            valueColor={member.invited ? colors.teal : colors.textHint}
            last
          />
        ) : null}
      </View>
    </>
  );
}
