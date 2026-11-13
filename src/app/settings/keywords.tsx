import { useState } from 'react';
import { View } from 'react-native';

import { listCategories } from '@/data/categories';
import { deleteKeyword, listKeywords, saveKeyword } from '@/data/keywords';
import { useLive } from '@/data/useLive';
import { getDb } from '@/db/client';
import { useT } from '@/i18n';
import {
  Avatar,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Field,
  Header,
  IconButton,
  Pill,
  Screen,
  SectionTitle,
  T,
} from '@/ui/kit';
import { CategorySheet } from '@/ui/Pickers';
import { space, useTheme } from '@/ui/theme';

/** The user's own and learned keywords for the entry parser. */
export default function Keywords() {
  const t = useT();
  const c = useTheme();
  const data = useLive((db) => ({ keywords: listKeywords(db), categories: listCategories(db) }));
  const [word, setWord] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const category = data.categories.find((cat) => cat.id === categoryId);
  const byId = new Map(data.categories.map((cat) => [cat.id, cat]));

  const add = () => {
    if (word.trim().length < 2 || !categoryId) return;
    saveKeyword(getDb(), word, categoryId, 'user');
    setWord('');
  };

  return (
    <Screen header={<Header back title={t('keywords.title')} />}>
      <T tone="muted">{t('keywords.explain')}</T>
      <Card style={{ gap: space.md }}>
        <Field
          label={t('keywords.word')}
          placeholder={t('keywords.wordPlaceholder')}
          value={word}
          onChangeText={setWord}
          autoCapitalize="none"
        />
        <View style={{ flexDirection: 'row' }}>
          <Chip
            icon={category?.icon ?? 'tag-outline'}
            iconColor={category?.color}
            label={category?.name ?? t('keywords.chooseCategory')}
            highlight={!category}
            accessibilityLabel={`${t('quick.category')}: ${category?.name ?? t('common.none')}`}
            onPress={() => setPicking(true)}
          />
        </View>
        <Button
          label={t('keywords.add')}
          icon="plus"
          onPress={add}
          disabled={word.trim().length < 2 || !categoryId}
        />
      </Card>

      <SectionTitle>{t('keywords.yours')}</SectionTitle>
      <Card padded={false}>
        {data.keywords.length === 0 ? (
          <EmptyState
            icon="book-alphabet"
            title={t('keywords.emptyTitle')}
            body={t('keywords.emptyBody')}
          />
        ) : (
          data.keywords.map((item, index) => {
            const target = byId.get(item.categoryId);
            return (
              <View key={item.id}>
                {index > 0 ? <Divider /> : null}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    paddingLeft: space.lg,
                    minHeight: 60,
                  }}
                >
                  <Avatar
                    icon={target?.icon ?? 'tag-outline'}
                    color={target?.color ?? c.textMuted}
                    size={36}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T style={{ fontWeight: '500' }}>{item.keyword}</T>
                    <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                      <T variant="caption" tone="muted">
                        {target?.name ?? t('common.uncategorized')}
                      </T>
                      {item.origin === 'learned' ? (
                        <Pill icon="school-outline" label={t('keywords.learned')} />
                      ) : null}
                    </View>
                  </View>
                  <IconButton
                    icon="close"
                    label={t('keywords.remove', { word: item.keyword })}
                    color={c.textMuted}
                    onPress={() => deleteKeyword(getDb(), item.id)}
                  />
                </View>
              </View>
            );
          })
        )}
      </Card>

      <CategorySheet
        visible={picking}
        title={t('quick.category')}
        categories={data.categories}
        value={categoryId}
        onSelect={setCategoryId}
        onClose={() => setPicking(false)}
      />
    </Screen>
  );
}
