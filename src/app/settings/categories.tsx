import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';

import { createCategory, listCategories, removeCategory, updateCategory } from '@/data/categories';
import { useLive } from '@/data/useLive';
import { getDb } from '@/db/client';
import { ICON_CHOICES, PALETTE } from '@/domain/defaults';
import type { Category, CategoryKind } from '@/domain/types';
import { useT } from '@/i18n';
import { useUi } from '@/state/ui';
import {
  Avatar,
  Button,
  Card,
  Divider,
  Field,
  Header,
  Icon,
  IconButton,
  Pill,
  Screen,
  Segmented,
  T,
} from '@/ui/kit';
import { radius, space, useTheme } from '@/ui/theme';

interface Draft {
  id: string | null;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  parentId: string | null;
}

export default function Categories() {
  const t = useT();
  const c = useTheme();
  const showSnackbar = useUi((s) => s.showSnackbar);
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const all = useLive((db) => listCategories(db, { includeArchived: true }));
  const visible = all.filter((cat) => cat.kind === kind && (showArchived || !cat.archived));
  const parents = visible.filter((cat) => cat.parentId === null);
  const archivedCount = all.filter((cat) => cat.kind === kind && cat.archived).length;

  const edit = (cat: Category) =>
    setDraft({
      id: cat.id,
      name: cat.name,
      kind: cat.kind,
      icon: cat.icon,
      color: cat.color,
      parentId: cat.parentId,
    });
  const add = (parentId: string | null) =>
    setDraft({
      id: null,
      name: '',
      kind,
      icon: 'tag-outline',
      color: PALETTE[all.length % PALETTE.length] ?? '#7F8C8D',
      parentId,
    });

  const save = () => {
    if (!draft || draft.name.trim() === '') return;
    if (draft.id)
      updateCategory(getDb(), draft.id, { name: draft.name, icon: draft.icon, color: draft.color });
    else createCategory(getDb(), draft);
    setDraft(null);
  };

  const remove = (cat: Category) => {
    Alert.alert(t('category.removeTitle', { name: cat.name }), t('category.removeBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: () => {
          const outcome = removeCategory(getDb(), cat.id);
          showSnackbar(outcome === 'archived' ? t('category.archived') : t('category.deleted'));
          setDraft(null);
        },
      },
    ]);
  };

  const row = (cat: Category, child: boolean) => (
    <Pressable
      key={cat.id}
      accessibilityRole="button"
      accessibilityLabel={`${cat.name}${cat.archived ? `, ${t('account.archivedPill')}` : ''}`}
      accessibilityHint={t('category.editHint')}
      onPress={() => edit(cat)}
      android_ripple={{ color: c.scrim }}
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingLeft: child ? space.xxl + space.lg : space.lg,
        paddingRight: space.xs,
        opacity: cat.archived ? 0.55 : 1,
      }}
    >
      <Avatar icon={cat.icon} color={cat.color} size={child ? 32 : 40} />
      <T style={{ flex: 1, fontWeight: child ? '400' : '500' }}>{cat.name}</T>
      {cat.archived ? <Pill icon="archive-outline" label={t('account.archivedPill')} /> : null}
      {!child && !cat.archived ? (
        <IconButton
          icon="plus"
          label={t('category.addSub', { name: cat.name })}
          color={c.textMuted}
          onPress={() => add(cat.id)}
        />
      ) : (
        <View style={{ width: 8 }} />
      )}
    </Pressable>
  );

  return (
    <Screen
      header={
        <Header
          back
          title={t('settings.categories')}
          right={<IconButton icon="plus" label={t('category.add')} onPress={() => add(null)} />}
        />
      }
    >
      <Segmented<CategoryKind>
        label={t('category.kind')}
        value={kind}
        onChange={setKind}
        options={[
          { value: 'expense', label: t('category.expense') },
          { value: 'income', label: t('category.income') },
        ]}
      />
      <Card padded={false}>
        {parents.map((parent, index) => (
          <View key={parent.id}>
            {index > 0 ? <Divider /> : null}
            {row(parent, false)}
            {visible.filter((cat) => cat.parentId === parent.id).map((child) => row(child, true))}
          </View>
        ))}
      </Card>
      {archivedCount > 0 ? (
        <Button
          label={
            showArchived
              ? t('category.hideArchived')
              : t('category.showArchived', { count: archivedCount })
          }
          variant="ghost"
          onPress={() => setShowArchived((v) => !v)}
        />
      ) : null}

      <Modal
        visible={draft !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setDraft(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: c.scrim }}
          onPress={() => setDraft(null)}
          accessibilityLabel={t('common.close')}
        />
        {draft ? (
          <View
            style={{
              backgroundColor: c.surface,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              marginTop: -radius.lg,
              maxHeight: '85%',
            }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: space.lg, gap: space.lg }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Avatar icon={draft.icon} color={draft.color} size={48} />
                <T variant="heading" style={{ flex: 1 }} accessibilityRole="header">
                  {draft.id
                    ? t('category.edit')
                    : draft.parentId
                      ? t('category.newSub')
                      : t('category.add')}
                </T>
              </View>
              <Field
                label={t('category.name')}
                value={draft.name}
                onChangeText={(name) => setDraft({ ...draft, name })}
                autoFocus={!draft.id}
                autoCapitalize="words"
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
                {PALETTE.map((color, i) => (
                  <Pressable
                    key={color}
                    accessibilityRole="radio"
                    accessibilityLabel={t('common.colourN', { n: i + 1 })}
                    accessibilityState={{
                      selected: draft.color === color,
                      checked: draft.color === color,
                    }}
                    onPress={() => setDraft({ ...draft, color })}
                    style={{
                      width: 48,
                      height: 48,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        backgroundColor: color,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: draft.color === color ? 3 : 0,
                        borderColor: c.text,
                      }}
                    >
                      {draft.color === color ? (
                        <Icon name="check" size={16} color="#FFFFFF" />
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
                {ICON_CHOICES.map((icon) => (
                  <Pressable
                    key={icon}
                    accessibilityRole="radio"
                    accessibilityLabel={icon.replace(/-outline$/, '').replace(/-/g, ' ')}
                    accessibilityState={{
                      selected: draft.icon === icon,
                      checked: draft.icon === icon,
                    }}
                    onPress={() => setDraft({ ...draft, icon })}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: draft.icon === icon ? c.accentSoft : 'transparent',
                    }}
                  >
                    <Icon name={icon} color={draft.icon === icon ? c.accent : c.textMuted} />
                  </Pressable>
                ))}
              </View>
              <Button
                label={t('common.save')}
                icon="check"
                onPress={save}
                disabled={draft.name.trim() === ''}
              />
              {draft.id ? (
                all.find((cat) => cat.id === draft.id)?.archived ? (
                  <Button
                    label={t('account.restore')}
                    variant="secondary"
                    onPress={() => {
                      if (draft.id) updateCategory(getDb(), draft.id, { archived: false });
                      setDraft(null);
                    }}
                  />
                ) : (
                  <Button
                    label={t('common.remove')}
                    variant="ghost"
                    icon="trash-can-outline"
                    onPress={() => {
                      const cat = all.find((item) => item.id === draft.id);
                      if (cat) remove(cat);
                    }}
                  />
                )
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </Screen>
  );
}
