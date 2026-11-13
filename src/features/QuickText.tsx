import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useRef, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';

import { listKeywords } from '@/data/keywords';
import type { Lookups } from '@/data/queries';
import { updateSettings } from '@/data/settings';
import { getDb } from '@/db/client';
import type { Day } from '@/domain/dates';
import { currencyInfo, toDecimalString } from '@/domain/money';
import { useSettings } from '@/hooks/useSettings';
import { useT } from '@/i18n';
import { parseEntry, type ParsedEntry, type ParsedField } from '@/parse';
import { Icon, IconButton, T } from '@/ui/kit';
import { radius, space, TOUCH, useTheme } from '@/ui/theme';

import type { ParsedHint } from './afterSave';
import type { EntryForm } from './useEntryForm';

type VoiceLanguage = 'en-IN' | 'hi-IN';

/** Maps a parse result onto the quick-add form. Fields the parser did not find are left alone. */
export function parsedToForm(
  parsed: ParsedEntry,
  decimals: number,
  spoken: boolean,
): Partial<EntryForm> {
  const changes: Partial<EntryForm> = {
    type: parsed.type,
    day: parsed.day,
    source: spoken ? 'voice' : 'manual',
  };
  if (parsed.amount !== null) {
    changes.amountText = toDecimalString(parsed.amount, decimals).replace(/\.0+$/, '');
  }
  if (parsed.categoryId !== null) changes.categoryId = parsed.categoryId;
  if (parsed.accountId !== null) changes.accountId = parsed.accountId;
  if (parsed.toAccountId !== null) changes.toAccountId = parsed.toAccountId;
  if (parsed.method !== null) changes.method = parsed.method;
  if (parsed.payee !== null) changes.payee = parsed.payee;
  return changes;
}

/**
 * "Type or say it": a text box and a microphone. Whatever is typed or
 * spoken is parsed on the device and fills the form; nothing is saved until
 * the user presses Save.
 */
export function QuickText({
  lookups,
  today,
  onFocusChange,
  onParsed,
}: {
  lookups: Lookups;
  today: Day;
  onFocusChange: (focused: boolean) => void;
  onParsed: (changes: Partial<EntryForm>, doubtful: ParsedField[], hint: ParsedHint) => void;
}) {
  const c = useTheme();
  const t = useT();
  const settings = useSettings();
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spoken = useRef(false);
  const decimals = currencyInfo(settings.currency).decimals;
  const language: VoiceLanguage =
    settings.voiceLanguage ?? (settings.language === 'hi' ? 'hi-IN' : 'en-IN');

  const run = (phrase: string, fromVoice: boolean) => {
    if (phrase.trim() === '') return;
    const parsed = parseEntry(phrase, {
      today,
      decimals,
      accounts: lookups.accounts.filter((a) => !a.archived),
      categories: lookups.categories.filter((cat) => !cat.archived),
      userKeywords: listKeywords(getDb()),
    });
    onParsed(parsedToForm(parsed, decimals, fromVoice), parsed.uncertain, {
      keyword: parsed.categoryKeyword,
      categoryId: parsed.categoryId,
    });
  };

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    if (event.error !== 'aborted' && event.error !== 'no-speech') setError(t('voice.error'));
    else if (event.error === 'no-speech') setError(t('voice.noSpeech'));
  });
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    setText(transcript);
    if (event.isFinal) {
      spoken.current = true;
      run(transcript, true);
    }
  });

  const begin = (onDevice: boolean) => {
    setError(null);
    ExpoSpeechRecognitionModule.start({
      lang: language,
      interimResults: true,
      continuous: false,
      maxAlternatives: 1,
      requiresOnDeviceRecognition: onDevice,
      // Amounts, payees and category words are more likely than general speech.
      contextualStrings: ['UPI', 'rupees', 'hazaar', 'lakh', 'paid', 'groceries'],
    });
  };

  const startListening = async () => {
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setError(t('voice.unavailable'));
      return;
    }
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError(t('voice.permission'));
      return;
    }
    if (ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
      begin(true);
    } else if (settings.voiceOnlineAllowed) {
      begin(false);
    } else {
      // Be honest: without an on-device model, Android's speech service may use the network.
      Alert.alert(t('voice.onlineTitle'), t('voice.onlineBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('voice.onlineAllow'),
          onPress: () => {
            updateSettings(getDb(), { voiceOnlineAllowed: true });
            begin(false);
          },
        },
      ]);
    }
  };

  return (
    <View style={{ paddingHorizontal: space.lg, gap: 4 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: listening ? c.accent : c.border,
          backgroundColor: c.surfaceAlt,
          paddingLeft: space.md,
        }}
      >
        <Icon name="text-recognition" size={20} color={c.textMuted} />
        <TextInput
          value={text}
          onChangeText={(value) => {
            spoken.current = false;
            setText(value);
          }}
          onFocus={() => onFocusChange(true)}
          onBlur={() => {
            onFocusChange(false);
            if (!spoken.current) run(text, false);
          }}
          onSubmitEditing={() => run(text, false)}
          returnKeyType="done"
          placeholder={listening ? t('voice.listening') : t('voice.placeholder')}
          placeholderTextColor={c.textMuted}
          accessibilityLabel={t('voice.inputLabel')}
          accessibilityHint={t('voice.inputHint')}
          style={{
            flex: 1,
            minHeight: TOUCH,
            color: c.text,
            fontSize: 15,
            paddingHorizontal: space.sm,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('voice.language', {
            language: language === 'hi-IN' ? 'हिन्दी' : 'English',
          })}
          accessibilityHint={t('voice.languageHint')}
          onPress={() =>
            updateSettings(getDb(), { voiceLanguage: language === 'hi-IN' ? 'en-IN' : 'hi-IN' })
          }
          style={{
            minWidth: TOUCH,
            minHeight: TOUCH,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <T variant="label" tone="muted">
            {language === 'hi-IN' ? 'हि' : 'EN'}
          </T>
        </Pressable>
        <IconButton
          icon={listening ? 'stop-circle-outline' : 'microphone-outline'}
          label={listening ? t('voice.stop') : t('voice.start')}
          color={listening ? c.danger : c.accent}
          onPress={() => void startListening()}
        />
      </View>
      {error ? (
        <T variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : null}
    </View>
  );
}
