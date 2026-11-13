import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Account, Category } from '@/domain/types';
import { useT } from '@/i18n';

import { Avatar, Divider, Icon, IconButton, Row, T } from './kit';
import { radius, space, useTheme } from './theme';

/** A bottom dialog listing choices. */
export function ChoiceSheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const c = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: c.scrim }}
        onPress={onClose}
        accessibilityLabel={t('common.close')}
      />
      <View
        style={{
          backgroundColor: c.surface,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          maxHeight: '75%',
          paddingBottom: insets.bottom + space.sm,
          marginTop: -radius.lg,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: space.lg,
            paddingRight: space.xs,
          }}
        >
          <T variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
            {title}
          </T>
          <IconButton icon="close" label={t('common.close')} onPress={onClose} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

export interface Option<V> {
  value: V;
  label: string;
  subtitle?: string;
  icon?: string;
  color?: string;
}

export function OptionSheet<V extends string | number | null>({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: Option<V>[];
  value: V | undefined;
  onSelect: (value: V) => void;
  onClose: () => void;
}) {
  const c = useTheme();
  return (
    <ChoiceSheet visible={visible} title={title} onClose={onClose}>
      {options.map((option, index) => (
        <View key={String(option.value)}>
          {index > 0 ? <Divider /> : null}
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel={
              option.subtitle ? `${option.label}, ${option.subtitle}` : option.label
            }
            accessibilityState={{
              selected: option.value === value,
              checked: option.value === value,
            }}
            onPress={() => {
              onSelect(option.value);
              onClose();
            }}
            android_ripple={{ color: c.scrim }}
          >
            <Row
              title={option.label}
              subtitle={option.subtitle}
              icon={option.icon}
              iconColor={option.color}
              right={option.value === value ? <Icon name="check" color={c.accent} /> : <View />}
            />
          </Pressable>
        </View>
      ))}
    </ChoiceSheet>
  );
}

export function accountOptions(
  accounts: Account[],
  subtitle?: (a: Account) => string,
): Option<string>[] {
  return accounts.map((a) => ({
    value: a.id,
    label: a.last4 ? `${a.name} ··${a.last4}` : a.name,
    subtitle: subtitle?.(a),
    icon: a.icon,
    color: a.color,
  }));
}

/** Categories as a grid, parents first with their subcategories indented beneath. */
export function CategorySheet({
  visible,
  title,
  categories,
  value,
  onSelect,
  onClose,
  allowNone,
}: {
  visible: boolean;
  title: string;
  categories: Category[];
  value: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  allowNone?: boolean;
}) {
  const c = useTheme();
  const t = useT();
  const parents = categories.filter((cat) => cat.parentId === null);
  const childrenOf = (id: string) => categories.filter((cat) => cat.parentId === id);
  const item = (cat: Category, child: boolean) => (
    <Pressable
      key={cat.id}
      accessibilityRole="radio"
      accessibilityLabel={cat.name}
      accessibilityState={{ selected: cat.id === value, checked: cat.id === value }}
      onPress={() => {
        onSelect(cat.id);
        onClose();
      }}
      android_ripple={{ color: c.scrim }}
      style={{
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingLeft: child ? space.xxl + space.lg : space.lg,
      }}
    >
      <Avatar icon={cat.icon} color={cat.color} size={child ? 30 : 36} />
      <T style={{ flex: 1, fontWeight: child ? '400' : '500' }}>{cat.name}</T>
      {cat.id === value ? <Icon name="check" color={c.accent} /> : null}
    </Pressable>
  );
  return (
    <ChoiceSheet visible={visible} title={title} onClose={onClose}>
      {allowNone ? (
        <Pressable
          accessibilityRole="radio"
          accessibilityLabel={t('common.none')}
          accessibilityState={{ selected: value === null, checked: value === null }}
          onPress={() => {
            onSelect(null);
            onClose();
          }}
          style={{
            minHeight: 52,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            paddingHorizontal: space.lg,
          }}
        >
          <Avatar icon="circle-off-outline" color={c.textMuted} size={36} />
          <T style={{ flex: 1 }}>{t('common.none')}</T>
          {value === null ? <Icon name="check" color={c.accent} /> : null}
        </Pressable>
      ) : null}
      {parents.map((parent) => (
        <View key={parent.id}>
          {item(parent, false)}
          {childrenOf(parent.id).map((child) => item(child, true))}
        </View>
      ))}
    </ChoiceSheet>
  );
}
