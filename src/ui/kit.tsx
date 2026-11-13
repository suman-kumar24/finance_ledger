/**
 * The app's small UI kit. Every control has a 48dp touch target, an
 * accessibility role and label, and scales with the system font size.
 */
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n';

import { radius, space, TOUCH, useTheme, type Palette } from './theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export function Icon({ name, size = 22, color }: { name: string; size?: number; color?: string }) {
  const c = useTheme();
  const valid = name in MaterialCommunityIcons.glyphMap ? (name as IconName) : 'tag-outline';
  return (
    <MaterialCommunityIcons
      name={valid}
      size={size}
      color={color ?? c.text}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';
type Tone = 'default' | 'muted' | 'accent' | 'positive' | 'warning' | 'danger' | 'onAccent';

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontSize: 40, lineHeight: 46, fontWeight: '700', letterSpacing: -0.5 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 12.5, lineHeight: 18, fontWeight: '400' },
};

export function toneColor(c: Palette, tone: Tone): string {
  switch (tone) {
    case 'muted':
      return c.textMuted;
    case 'accent':
      return c.accent;
    case 'positive':
      return c.positive;
    case 'warning':
      return c.warning;
    case 'danger':
      return c.danger;
    case 'onAccent':
      return c.onAccent;
    default:
      return c.text;
  }
}

export interface TProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  /** Tabular digits, for amounts that line up. */
  numeric?: boolean;
  center?: boolean;
}

export function T({ variant = 'body', tone = 'default', numeric, center, style, ...rest }: TProps) {
  const c = useTheme();
  return (
    <RNText
      // Large figures stop growing before they break the layout.
      maxFontSizeMultiplier={variant === 'display' ? 1.3 : variant === 'title' ? 1.6 : 2}
      {...rest}
      style={[
        VARIANTS[variant],
        { color: toneColor(c, tone) },
        numeric && { fontVariant: ['tabular-nums'] },
        center && { textAlign: 'center' },
        style,
      ]}
    />
  );
}

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const c = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.border,
          padding: padded ? space.lg : 0,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  style,
  accessibilityHint,
  compact,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  compact?: boolean;
}) {
  const c = useTheme();
  const bg =
    variant === 'primary'
      ? c.accent
      : variant === 'danger'
        ? c.danger
        : variant === 'secondary'
          ? c.accentSoft
          : 'transparent';
  const fg =
    variant === 'primary'
      ? c.onAccent
      : variant === 'danger'
        ? c.dark
          ? '#2B0B09'
          : '#FFFFFF'
        : c.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: c.scrim }}
      style={({ pressed }) => [
        {
          minHeight: TOUCH,
          paddingHorizontal: compact ? space.md : space.xl,
          paddingVertical: space.sm,
          borderRadius: radius.pill,
          backgroundColor: bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={20} color={fg} /> : null}
      <T variant="label" style={{ color: fg }}>
        {label}
      </T>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  color,
  size = 24,
  background,
  disabled,
}: {
  icon: string;
  /** Read by TalkBack; required because the button has no visible text. */
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
  background?: string;
  disabled?: boolean;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      android_ripple={{ color: c.scrim, borderless: true, radius: TOUCH / 2 }}
      style={{
        width: TOUCH,
        height: TOUCH,
        borderRadius: TOUCH / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: background,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={icon} size={size} color={color ?? c.text} />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  iconColor,
  highlight,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: string;
  iconColor?: string;
  /** Draws attention to a value the app guessed and the user should check. */
  highlight?: boolean;
  accessibilityLabel?: string;
}) {
  const c = useTheme();
  const fg = selected ? c.onAccent : c.text;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      android_ripple={{ color: c.scrim }}
      style={{
        minHeight: TOUCH,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        borderWidth: highlight ? 2 : 1,
        borderStyle: highlight ? 'dashed' : 'solid',
        borderColor: highlight ? c.warning : selected ? c.accent : c.border,
        backgroundColor: selected ? c.accent : highlight ? c.warningSoft : c.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs + 2,
        overflow: 'hidden',
      }}
    >
      {icon ? (
        <Icon name={icon} size={18} color={selected ? c.onAccent : (iconColor ?? c.textMuted)} />
      ) : null}
      <T variant="label" style={{ color: fg }} numberOfLines={1}>
        {label}
      </T>
      {highlight ? <Icon name="help-circle-outline" size={16} color={c.warning} /> : null}
    </Pressable>
  );
}

export type PillTone = 'neutral' | 'positive' | 'warning' | 'danger' | 'accent';

/** A status label. Always an icon AND a word, never colour alone. */
export function Pill({
  label,
  icon,
  tone = 'neutral',
}: {
  label: string;
  icon: string;
  tone?: PillTone;
}) {
  const c = useTheme();
  const map: Record<PillTone, { bg: string; fg: string }> = {
    neutral: { bg: c.surfaceAlt, fg: c.textMuted },
    positive: { bg: c.positiveSoft, fg: c.positive },
    warning: { bg: c.warningSoft, fg: c.warning },
    danger: { bg: c.dangerSoft, fg: c.danger },
    accent: { bg: c.accentSoft, fg: c.accent },
  };
  const { bg, fg } = map[tone];
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingHorizontal: space.sm + 2,
        paddingVertical: 3,
      }}
    >
      <Icon name={icon} size={14} color={fg} />
      <T variant="caption" style={{ color: fg, fontWeight: '600' }}>
        {label}
      </T>
    </View>
  );
}

export function ProgressBar({
  value,
  tone = 'accent',
  marker,
  height = 10,
  label,
}: {
  /** 0-1 (values above 1 are drawn as full). */
  value: number;
  tone?: 'accent' | 'warning' | 'danger' | 'positive';
  /** Optional 0-1 position of a tick, e.g. "where today is in the month". */
  marker?: number;
  height?: number;
  label: string;
}) {
  const c = useTheme();
  const fill =
    tone === 'danger'
      ? c.danger
      : tone === 'warning'
        ? c.warning
        : tone === 'positive'
          ? c.positive
          : c.accent;
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ height: height + 8, justifyContent: 'center' }}
    >
      <View
        style={{ height, borderRadius: height / 2, backgroundColor: c.track, overflow: 'hidden' }}
      >
        <View
          style={{
            width: `${pct * 100}%`,
            height,
            borderRadius: height / 2,
            backgroundColor: fill,
          }}
        />
      </View>
      {marker !== undefined ? (
        <View
          style={{
            position: 'absolute',
            left: `${Math.max(0, Math.min(1, marker)) * 100}%`,
            width: 2,
            marginLeft: -1,
            height: height + 8,
            backgroundColor: c.text,
            borderRadius: 1,
          }}
        />
      ) : null}
    </View>
  );
}

export function Header({
  title,
  back,
  right,
  subtitle,
}: {
  title: string;
  back?: boolean;
  right?: ReactNode;
  subtitle?: string;
}) {
  const t = useT();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: space.xs }}>
      {back ? (
        <IconButton
          icon="arrow-left"
          label={t('common.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      ) : null}
      <View style={{ flex: 1, paddingLeft: back ? 0 : space.xs }}>
        <T variant="title" accessibilityRole="header" numberOfLines={1}>
          {title}
        </T>
        {subtitle ? (
          <T variant="caption" tone="muted">
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Screen({
  children,
  header,
  scroll = true,
  footer,
  padBottom = 0,
}: {
  children: ReactNode;
  header?: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  padBottom?: number;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      {header ? <View style={{ paddingHorizontal: space.lg }}>{header}</View> : null}
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: space.lg,
            paddingBottom: space.xxl + padBottom + (footer ? 0 : insets.bottom),
            gap: space.lg,
          }}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
      {footer ? (
        <View
          style={{
            padding: space.lg,
            paddingBottom: space.lg + insets.bottom,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: c.border,
            backgroundColor: c.bg,
            gap: space.sm,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 32 }}>
      <T variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
        {children}
      </T>
      {action}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  icon,
  iconColor,
  right,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  danger,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  iconColor?: string;
  right?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  danger?: boolean;
}) {
  const c = useTheme();
  const body = (
    <View
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.sm,
        paddingHorizontal: space.lg,
      }}
    >
      {icon ? (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: c.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={20} color={danger ? c.danger : (iconColor ?? c.accent)} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <T
          variant="body"
          tone={danger ? 'danger' : 'default'}
          style={{ fontWeight: '500' }}
          numberOfLines={2}
        >
          {title}
        </T>
        {subtitle ? (
          <T variant="caption" tone="muted" numberOfLines={3}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" size={22} color={c.textMuted} /> : null)}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      android_ripple={{ color: c.scrim }}
    >
      {body}
    </Pressable>
  );
}

export function Divider() {
  const c = useTheme();
  return (
    <View
      style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: space.lg }}
    />
  );
}

export function SwitchRow({
  title,
  subtitle,
  value,
  onChange,
  icon,
  disabled,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  icon?: string;
  disabled?: boolean;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Row
        title={title}
        subtitle={subtitle}
        icon={icon}
        right={
          <Switch
            value={value}
            onValueChange={onChange}
            disabled={disabled}
            trackColor={{ true: c.accent, false: c.track }}
            thumbColor={c.dark ? '#E7F0EC' : '#FFFFFF'}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          />
        }
      />
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  error,
  style,
  ...input
}: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  const c = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <T variant="label" tone="muted">
        {label}
      </T>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={c.textMuted}
        {...input}
        style={[
          {
            minHeight: TOUCH + 4,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: error ? c.danger : c.border,
            backgroundColor: c.surface,
            color: c.text,
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
            fontSize: 16,
          },
          style,
        ]}
      />
      {error ? (
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          <Icon name="alert-circle-outline" size={14} color={c.danger} />
          <T variant="caption" tone="danger">
            {error}
          </T>
        </View>
      ) : hint ? (
        <T variant="caption" tone="muted">
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
  icon?: string;
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
  label: string;
}) {
  const c = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        backgroundColor: c.surfaceAlt,
        borderRadius: radius.pill,
        padding: 3,
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minHeight: TOUCH - 6,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 4,
              backgroundColor: selected ? c.surface : 'transparent',
              borderWidth: selected ? StyleSheet.hairlineWidth : 0,
              borderColor: c.border,
              paddingHorizontal: space.xs,
            }}
          >
            {option.icon ? (
              <Icon name={option.icon} size={16} color={selected ? c.accent : c.textMuted} />
            ) : null}
            <T variant="label" tone={selected ? 'accent' : 'muted'} numberOfLines={1}>
              {option.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const c = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.xxl,
        paddingHorizontal: space.xl,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: c.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={34} color={c.accent} />
      </View>
      <T variant="heading" center>
        {title}
      </T>
      {body ? (
        <T tone="muted" center>
          {body}
        </T>
      ) : null}
      {action}
    </View>
  );
}

export function Banner({
  tone,
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  tone: 'warning' | 'danger' | 'accent' | 'positive';
  icon: string;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const c = useTheme();
  const map = {
    warning: { bg: c.warningSoft, fg: c.warning },
    danger: { bg: c.dangerSoft, fg: c.danger },
    accent: { bg: c.accentSoft, fg: c.accent },
    positive: { bg: c.positiveSoft, fg: c.positive },
  } as const;
  const { bg, fg } = map[tone];
  return (
    <View
      accessible={!onAction}
      accessibilityRole="alert"
      accessibilityLabel={body ? `${title}. ${body}` : title}
      style={{
        backgroundColor: bg,
        borderRadius: radius.md,
        padding: space.md,
        flexDirection: 'row',
        gap: space.md,
        alignItems: 'center',
      }}
    >
      <Icon name={icon} size={22} color={fg} />
      <View style={{ flex: 1 }}>
        <T variant="label" style={{ color: fg }}>
          {title}
        </T>
        {body ? <T variant="caption">{body}</T> : null}
      </View>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="ghost" compact />
      ) : null}
    </View>
  );
}

/** A coloured circle with an icon, used for categories and accounts. */
export function Avatar({ icon, color, size = 40 }: { icon: string; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${color}26`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={size * 0.5} color={color} />
    </View>
  );
}
